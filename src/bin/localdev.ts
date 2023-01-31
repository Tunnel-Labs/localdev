import fs from 'node:fs'
import path from 'node:path'

import { program } from 'commander'
import killPort from 'kill-port'
import { ref } from 'valtio'

import {
	getLocaldevConfig,
	getLocaldevConfigPath,
	getLocaldevLocalConfigPath,
} from '~/utils/config.js'
import { Service } from '~/utils/service.js'
import { setupLocaldevServer } from '~/utils/setup.js'
import { localdevState } from '~/utils/state.js'
import { TerminalUpdater } from '~/utils/terminal.js'

await program
	.name('localdev')
	.description('An interactive TUI for local development')
	.option(
		'-p, --port <number>',
		'specify a port for the localdev proxy to listen to'
	)
	.option('--project <path>', 'a path to your project folder', process.cwd())
	.option('--config <path>', 'a path to the localdev configuration file')
	.option(
		'--local-config <path>',
		'a path to the localdev local configuration file'
	)
	.option('--no-services', "don't start dev services")
	.option('--force', 'kill process on port if exists')
	.action(
		async (options: {
			test?: boolean
			services?: boolean
			port?: string
			config?: string
			localConfig?: string
			project: string
			force: boolean
		}) => {
			if (options.force) {
				await killPort(options.port === undefined ? 7357 : Number(options.port))
			}

			localdevState.projectPath = options.project
			localdevState.localdevConfigPath = await getLocaldevConfigPath({
				configPath: options.config,
			})
			localdevState.localdevLocalConfigPath = await getLocaldevLocalConfigPath({
				localConfigPath: options.localConfig,
			})
			localdevState.localdevConfig = await getLocaldevConfig({
				configPath: localdevState.localdevConfigPath,
				localConfigPath: localdevState.localdevLocalConfigPath,
			})

			const localdevLogsPath = path.join(
				localdevState.projectPath,
				'node_modules/.localdev/logs'
			)
			await fs.promises.rm(localdevLogsPath, { recursive: true, force: true })
			await fs.promises.mkdir(localdevLogsPath, { recursive: true })

			await setupLocaldevServer()
			const localdevService = new Service('$localdev')

			if (options.services) {
				const services = []
				for (const [serviceId, serviceSpec] of Object.entries(
					localdevState.localdevConfig.services ?? {}
				)) {
					services.push(new Service(serviceId, serviceSpec))
				}

				for (const service of services) {
					if (service.spec.startAutomatically) {
						service.run().catch((error) => {
							console.error(error)
							service.status = 'failed'
						})
					} else {
						service.status = 'stopped'
					}
				}
			} else {
				localdevState.servicesEnabled = false
			}

			await localdevService.initialize()

			const terminalUpdater = new TerminalUpdater()
			localdevState.terminalUpdater = ref(terminalUpdater)

			terminalUpdater.start()
		}
	)
	.parseAsync()

process.on('uncaughtException', (error) => {
	console.error(error)
})

process.on('unhandledRejection', (error) => {
	console.error(error)
})
