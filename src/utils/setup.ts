import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

import fastifyExpress from '@fastify/express'
import boxen from 'boxen'
import chalk from 'chalk'
import { fastify } from 'fastify'
import { got } from 'got'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { outdent } from 'outdent'
import invariant from 'tiny-invariant'

import { type LocaldevConfig } from '~/index.js'
import { cli } from '~/utils/cli.js'
import { createMkcertCerts } from '~/utils/mkcert.js'
import { Service } from '~/utils/service.js'
import { localdevState } from '~/utils/state.js'

export async function setupLocalProxy(
	// eslint-disable-next-line @typescript-eslint/ban-types -- Need to exclude the "boolean" type
	localProxyOptions: LocaldevConfig['localProxy'] & object
) {
	const localDomains = [
		'localdev.test',
		...(localProxyOptions.localDomains ?? []),
	]
	const { ca, key, cert } = await createMkcertCerts({
		localDomains,
	})

	const testHttpServer = http.createServer((_req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/plain' })
		res.end('OK')
	})
	testHttpServer.listen(localProxyOptions.port)

	const logProvider = () => ({
		...console,
		error(message: string) {
			// We want to ignore ECONNREFUSED errors because those just mean that the service hasn't started up yet
			if (
				message.includes('[ECONNREFUSED]') ||
				message.includes('writeAfterFIN') ||
				message.includes('read ECONNRESET')
			) {
				return
			}

			console.error(message)
		},
	})

	function createHttpServer() {
		/**
			The HTTP server redirects all requests to the HTTPS server
		*/
		const httpServer: http.Server = http.createServer((req, res) => {
			res.writeHead(301, {
				Location: 'https://' + String(req.headers.host) + (req.url ?? ''),
			})
			res.end()
		})

		httpServer.listen(80)
	}

	async function createHttpsServer() {
		const httpsProxy = createProxyMiddleware({
			secure: true,
			ws: true,
			logProvider,
			logLevel: 'error',
			target: null!,
			router(req) {
				if (req.hostname === 'localdev.test') {
					return `http://localhost:${localProxyOptions.port}`
				}

				return (
					localProxyOptions.proxyRouter?.(req) ??
					`http://localhost:${localProxyOptions.port}`
				)
			},
		})

		let httpsServer!: https.Server
		const httpsProxyApp = fastify({
			serverFactory(handler) {
				httpsServer = https.createServer({ ca, key, cert }, handler)
				httpsServer.on('error', (error) => {
					console.error(error)
				})
				invariant(
					httpsProxy.upgrade !== undefined,
					'`httpsProxy.upgrade` is not undefined'
				)
				httpsServer.on('upgrade', httpsProxy.upgrade)
				return httpsServer
			},
		})
		httpsProxyApp.addHook('onRequest', (request, response, next) => {
			if (request.hostname.endsWith('.localtest.me')) {
				/**
					Google Cloud doesn't support `.test` TLDs as redirect URLs, so instead, we specify a subdomain of `localtest.me` as a redirect URL. Google will
				*/
				const newUrl: string =
					request.protocol +
					'://' +
					request.hostname.replace('.localtest.me', '') +
					request.url

				if (Service.has('$localdev')) {
					const localdevService = Service.get('$localdev')
					localdevService.process.addLogs(
						`Redirecting to ${newUrl} from a \`localtest.me\` domain...`
					)
				}

				void response.redirect(301, newUrl)
			} else {
				next()
			}
		})
		await httpsProxyApp.register(fastifyExpress)
		void httpsProxyApp.use(httpsProxy)
		await httpsProxyApp.ready()
		// We listen on port 443 with Node's http server because listening on port 443 with fastify requires root privileges
		httpsServer.listen(443)
	}

	createHttpServer()
	await createHttpsServer()

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
			'echo "nameserver 127.0.0.1" > /etc/resolver/test',
		])
	}

	try {
		await got.get('https://localdev.test', {
			https: {
				rejectUnauthorized: false,
			},
		})
	} catch {
		// `https://test.test` could not be resolved; `dnsmasq` is likely not started
		console.info('Starting dnsmasq...')
		await cli.sudo(['brew', 'services', 'start', 'dnsmasq'])
	}
}

export async function setupLocaldevServer({ port }: { port: number }) {
	if (localdevState.localdevConfig.localProxy) {
		await setupLocalProxy({ port })
	}
}
