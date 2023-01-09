import { program } from 'commander'
import { ref } from 'valtio'

import { loadLocaldevConfig } from '~/utils/config.js'
import { Service } from '~/utils/service.js'
import { setupLocaldevServer } from '~/utils/setup.js'
import { localdevState } from '~/utils/store.js'
import { TerminalUpdater } from '~/utils/terminal.js'

await program
	.name('localdev')
	.description('An interactive TUI for local development')
	.option('-t, --test', 'run the dev script in test mode')
	.option('-p, --port <number>', 'specify a port for the localdev proxy to listen to')
	.option('--no-services', "don't start dev services")
	.action(
		async (options: { test?: boolean; services?: boolean; port?: string }) => {
			await loadLocaldevConfig()
			await setupLocaldevServer({ port: Number(options.port ?? 7357) })
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
						service
							.run({ mode: options.test ? 'test' : 'development' })
							.catch((error) => {
								console.error(error)
								service.status = 'failed'
							})
					}
				}
			} else {
				localdevState.servicesEnabled = false
			}

			localdevService.initialize()

			const terminalUpdater = new TerminalUpdater({
				mode: options.test ? 'test' : 'development',
			})
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
