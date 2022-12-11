import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

import { cli } from '@dialect-inc/cli-helpers'
import { getErrorMessage, log } from '@dialect-inc/logger'
import { servicesData } from '@dialect-inc/services-data'
import { createServerSocketMessageHandler } from '@dialect-inc/socket'
import fastifyExpress from '@fastify/express'
import boxen from 'boxen'
import chalk from 'chalk'
import { fastify } from 'fastify'
import fastifySocketIo from 'fastify-socket.io'
import { createProxyMiddleware } from 'http-proxy-middleware'
import killPort from 'kill-port'
import { outdent } from 'outdent'
import reqUrl from 'requrl'
import { check as checkPort } from 'tcp-port-used'

import * as socketEventHandlers from '~/socket-event-handlers/index.js'
import { createMkcertCerts } from '~/utils/mkcert.js'
import { localdevServerStore } from '~/utils/server/store.js'

export async function setupLocaldevServer() {
	const app = fastify()
	localdevServerStore.setState({ app })

	// @ts-expect-error: `fastify-socket.io` has broken typings
	void app.register(fastifySocketIo)

	if (await checkPort(servicesData.localdev.port)) {
		try {
			await killPort(servicesData.localdev.port)
		} catch {}
	}

	app
		.listen({ port: servicesData.localdev.port, host: 'localhost' })
		.catch((error: unknown) => {
			log.error(`Error from fastify instance: ${getErrorMessage(error)}`)
			process.exit(1)
		})

	// We wait for app to be ready because `app.io` only exists after the app is ready
	await app.ready()

	app.io.on('connection', (socket) => {
		// log.debug('Socket connected')

		socket.on('joinRoom', async (roomName: string, ack?: () => void) => {
			await socket.join(roomName)
			// log.debug(`Socket joined room ${roomName}`)
			ack?.()
		})

		socket.on('leaveRoom', async (roomName: string, ack?: () => void) => {
			await socket.leave(roomName)
			// log.debug(`Socket left room ${roomName}`)
			ack?.()
		})

		socket.on(
			'message',
			createServerSocketMessageHandler({
				socketEventHandlers,
				socket
			})
		)

		socket.on('disconnect', () => {
			// log.debug('socket disconnected')
		})
	})

	const { key, cert } = await createMkcertCerts({
		localDomains: ['dialect.test', '*.dialect.test', '*.run.dialect.test']
	})

	const testUrlToLocalhostUrl = (url: string): string => {
		const { hostname } = new URL(url)

		// eslint-disable-next-line unicorn/prefer-switch -- if-else statements are easier to follow in this case
		if (hostname === 'dialect.test' || hostname === 'www.dialect.test') {
			return `http://localhost:${servicesData.dialectWebsite.port}`
		} else if (hostname === 'tunnel.test' || hostname === 'www.tunnel.test') {
			return `http://localhost:${servicesData.tunnelWebsite.port}/_tunnel`
		} else if (hostname === 'internal-docs.dialect.test') {
			return `http://localhost:${servicesData.internalDocs.port}`
		} else if (hostname === 'dialect-pitch.dialect.test') {
			return `http://localhost:${servicesData.dialectPitchDeck.port}`
		} else if (
			hostname === 'run.dialect.test' ||
			hostname.endsWith('.run.dialect.test')
		) {
			return `http://localhost:${servicesData.tunnelServer.port}`
		} else if (hostname === 'prisma.dialect.test') {
			return `http://localhost:${servicesData.prismaStudio.port}`
		} else {
			throw new Error('Unknown .test URL')
		}
	}

	const proxy = createProxyMiddleware({
		logProvider: () => console,
		logLevel: 'error',
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- We use the `router` property to set the target dynamically, so this `target` property is useless (but the types require it to be not undefined at runtime, so we use `null`)
		target: null! as string,
		router(req) {
			return testUrlToLocalhostUrl(reqUrl(req))
		}
	})

	const createHttpServer = async () => {
		let httpServer!: http.Server
		const httpProxyApp = fastify({
			serverFactory(handler) {
				httpServer = http.createServer(handler)
				httpServer.on('error', (error) => {
					console.error(error)
				})
				return httpServer
			}
		})
		await httpProxyApp.register(fastifyExpress)
		void httpProxyApp.use(proxy)
		await httpProxyApp.ready()
		// We listen on port 80 with Node's http server because listening on port 80 with fastify requires root privileges
		httpServer.listen(80)
	}

	const createHttpsServer = async () => {
		let httpsServer!: https.Server
		const httpsProxyApp = fastify({
			serverFactory(handler) {
				httpsServer = https.createServer({ key, cert }, handler)
				httpsServer.on('error', (error) => {
					console.error(error)
				})
				return httpsServer
			}
		})
		await httpsProxyApp.register(fastifyExpress)
		void httpsProxyApp.use(proxy)
		await httpsProxyApp.ready()
		// We listen on port 443 with Node's http server because listening on port 443 with fastify requires root privileges
		httpsServer.listen(443)
	}

	await Promise.all([createHttpServer(), createHttpsServer()])

	/**
		Set up dnsmasq so you can visit local `*.test` domains
		@see https://gist.github.com/ogrrd/5831371
	*/
	if (!(await cli.dnsmasq.exists())) {
		await cli.dnsmasq.install()
	}

	const { stdout: brewPrefix } = await cli.homebrew('--prefix')
	await fs.promises.mkdir(path.join(brewPrefix, 'etc'), { recursive: true })
	const dnsmasqConfPath = path.join(brewPrefix, 'etc/dnsmasq.conf')

	const addressTestLine = 'address=/.test/127.0.0.1'
	if (fs.existsSync(dnsmasqConfPath)) {
		const dnsmasqConf = await fs.promises.readFile(dnsmasqConfPath, 'utf8')
		if (!new RegExp(`^${addressTestLine}$`, 'm').test(dnsmasqConf)) {
			await fs.promises.appendFile(
				dnsmasqConfPath,
				'\n' + addressTestLine + '\n'
			)
		}
	} else {
		await fs.promises.writeFile(dnsmasqConfPath, addressTestLine)
	}

	if (!fs.existsSync('/etc/resolver')) {
		process.stderr.write(
			boxen(
				outdent`
					To resolve *.test domains, localdev needs sudo permissions
					to create a resolver file at \`/etc/resolver/test\`.

					${chalk.italic('You may be prompted for your administrator password.')}
				`,
				{ padding: 1, borderStyle: 'round' }
			)
		)
		await cli.homebrew('services start dnsmasq')
		await cli.sudo(['mkdir', '/etc/resolver'])
		await cli.sudo([
			'bash',
			'-c',
			'echo "nameserver 127.0.0.1" > /etc/resolver/test'
		])
	}
}
