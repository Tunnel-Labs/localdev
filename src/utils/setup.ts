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
import { minimatch } from 'minimatch'
import { outdent } from 'outdent'
import invariant from 'tiny-invariant'
import tmp from 'tmp-promise'
import which from 'which'

import { type LocaldevConfig } from '~/index.js'
import { cli } from '~/utils/cli.js'
import { createMkcertCerts } from '~/utils/mkcert.js'
import { Service } from '~/utils/service.js'
import { localdevState } from '~/utils/state.js'

export async function setupLocalProxy(
	// eslint-disable-next-line @typescript-eslint/ban-types -- Need to exclude the "boolean" type
	localProxyOptions: LocaldevConfig['localProxy'] & object
) {
	// We need to make sure that we can listen on port 80
	let server: http.Server | undefined
	try {
		server = http.createServer().listen(80)
	} catch {
		process.stderr.write(
			boxen(
				outdent`
					Running \`setcap\` to allow Node to listen on lower ports (necessary for the localdev proxy to work). You may be prompted for your administrator password.
				`,
				{ margin: 1, padding: 1, borderStyle: 'round' }
			)
		)
		const nodePath = await fs.promises.realpath(await which('node'))
		await cli.sudo(['setcap', 'CAP_NET_BIND_SERVICE=+eip', nodePath], {
			stdio: 'inherit',
		})
	} finally {
		if (server !== undefined) {
			await new Promise((resolve) => {
				server!.close(resolve)
			})
		}
	}

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

	async function createHttpServer() {
		const httpProxy = createProxyMiddleware({
			secure: false,
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

		let httpServer!: http.Server
		const httpProxyApp = fastify({
			serverFactory(handler) {
				httpServer = http.createServer(handler)
				httpServer.on('error', (error) => {
					console.error(error)
				})
				invariant(
					httpProxy.upgrade !== undefined,
					'`httpsProxy.upgrade` is not undefined'
				)
				httpServer.on('upgrade', httpProxy.upgrade)
				return httpServer
			},
		})

		httpProxyApp.addHook('onRequest', (request, response, next) => {
			const redirect = () => {
				void response.redirect(
					301,
					'https://' + String(request.hostname) + request.url
				)
			}

			const { httpsRedirect } = localProxyOptions

			if (httpsRedirect === undefined) {
				next()
			} else if (typeof httpsRedirect === 'boolean') {
				if (httpsRedirect) {
					redirect()
				} else {
					next()
				}
			} else if (
				typeof httpsRedirect === 'string' ||
				Array.isArray(httpsRedirect)
			) {
				if (
					[httpsRedirect]
						.flat()
						.some((pattern) => minimatch(request.hostname, pattern))
				) {
					redirect()
				} else {
					next()
				}
			} else if (typeof httpsRedirect === 'function') {
				if (httpsRedirect(request.hostname)) {
					redirect()
				} else {
					next()
				}
			} else {
				throw new TypeError('Unknown httpsRedirect argument type')
			}
		})

		await httpProxyApp.register(fastifyExpress)
		void httpProxyApp.use(httpProxy)
		await httpProxyApp.ready()
		// We listen on port 80 with Node's http server because listening on port 80 with fastify requires root privileges
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
					Google Cloud doesn't support `.test` TLDs as redirect URLs, so instead, we specify a subdomain of `localtest.me` as a redirect URL.
				*/
				const newUrl: string =
					request.protocol +
					'://' +
					request.hostname.replace('.localtest.me', '') +
					request.url

				if (Service.has('$localdev')) {
					const localdevService = Service.get('$localdev')
					void localdevService.process.addLogs(
						`Redirecting to ${newUrl} from a \`localtest.me\` domain...\n`
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

	await Promise.all([createHttpServer(), createHttpsServer()])

	const dnsmasqConf = outdent`
		address=/.test/127.0.0.1
	`
	const { path: dnsmasqConfPath } = await tmp.file()
	await fs.promises.writeFile(dnsmasqConfPath, dnsmasqConf)

	process.stderr.write(
		boxen(
			outdent({ trimTrailingNewline: false })`
				Running dnsmasq to proxy *.test domains to localhost.

				${chalk.italic('You may be prompted for your administrator password.')}
			`,
			{ padding: 1, borderStyle: 'round' }
		)
	)

	cli
		.dnsmasq(['--keep-in-foreground', '-C', dnsmasqConfPath])
		.catch((error) => {
			console.error('dnsmasq failed with error:', error)
			process.exit(1)
		})

	if (!fs.existsSync('/etc/resolver')) {
		process.stderr.write(
			boxen(
				outdent({ trimTrailingNewline: false })`
					To resolve *.test domains, localdev needs sudo permissions
					to create a resolver file at \`/etc/resolver/test\`.

					${chalk.italic('You may be prompted for your administrator password.')}
				`,
				{ padding: 1, borderStyle: 'round' }
			)
		)
		await cli.sudo(['mkdir', '/etc/resolver'])
		await cli.sudo([
			'sh',
			'-c',
			'echo "nameserver 127.0.0.1" > /etc/resolver/test',
		])
	}

	try {
		process.stderr.write(`Connecting to ${chalk.bold('localdev.test')}...\n`)
		await got.get('https://localdev.test', {
			https: {
				rejectUnauthorized: false,
			},
			timeout: {
				lookup: 1000,
				connect: 1000,
				secureConnect: 1000,
			},
		})
	} catch {
		// `https://test.test` could not be resolved; `dnsmasq` is likely not started
		if (process.platform === 'darwin') {
			console.info('Starting dnsmasq...')
			await cli.sudo(['brew', 'services', 'start', 'dnsmasq'])
		} else {
			process.stderr.write(outdent`
				\`dnsmasq\` doesn't seem to be running. Make sure you've installed it on your system.\n
			`)
			process.exit(1)
		}
	}
}

export async function setupLocaldevServer() {
	if (localdevState.localdevConfig.localProxy) {
		await setupLocalProxy(localdevState.localdevConfig.localProxy)
	}
}
