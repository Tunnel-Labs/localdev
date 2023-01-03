import { program } from 'commander'

import { loadLocaldevConfig, localdevConfig } from '~/utils/config.js'
import { markRaw } from '~/utils/raw.js'
import { Service } from '~/utils/service.js'
import { setupLocaldevServer } from '~/utils/setup.js'
import { localdevStore } from '~/utils/store.js'
import { TerminalUpdater } from '~/utils/terminal.js'

await program
	.name('localdev')
	.description('An interactive TUI for local development')
	.option('-t, --test', 'run the dev script in test mode')
	.option('--no-services', "don't start dev services")
	.action(async (options: { test?: boolean; services?: boolean }) => {
		await loadLocaldevConfig()
		await setupLocaldevServer()
		const localdevService = new Service('$localdev')

		if (options.services) {
			const services = []
			for (const [serviceId, serviceSpec] of Object.entries(
				localdevConfig.value.services ?? {}
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
			localdevStore.servicesEnabled = false
		}

		localdevService.initialize()

		const terminalUpdater = new TerminalUpdater({
			mode: options.test ? 'test' : 'development',
		})
		localdevStore.terminalUpdater = markRaw(terminalUpdater)
		terminalUpdater.start()
	})
	.parseAsync()

process.on('uncaughtException', (error) => {
	console.error(error)
})

process.on('unhandledRejection', (error) => {
	console.error(error)
})
