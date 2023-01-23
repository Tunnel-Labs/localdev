import { Command } from 'commander'
import onetime from 'onetime'
import open from 'open'
import prettyMilliseconds from 'pretty-ms'
import { ref } from 'valtio'

import type { LocaldevCommandSpec } from '~/types/command.js'
import { HelpPane } from '~/utils/command-panes/help.js'
import { HijackPane } from '~/utils/command-panes/hijack.js'
import { LogsPane } from '~/utils/command-panes/logs.js'
import { ServiceStatusesPane } from '~/utils/command-panes/service-statuses.js'
import { clearLogs } from '~/utils/logs.js'
import { spawnProcess } from '~/utils/process.js'
import { Service } from '~/utils/service.js'
import { localdevState } from '~/utils/state.js'

export function createCommand(name: string) {
	return new Command(name).helpOption(false).exitOverride()
}

export function defineCommandSpec(
	command: Command,
	options?: { hidden?: boolean }
): LocaldevCommandSpec {
	return {
		// Prevent commander from calling `process.exit` when inputting a malformed command
		command,
		hidden: options?.hidden ?? false,
	}
}

const defaultCommandSpecs = [
	defineCommandSpec(
		createCommand('r')
			.description('refresh the terminal output')
			.action(() => {
				if (localdevState.terminalUpdater === null) {
					console.error('TerminalUpdater has not been initialized yet')
					return
				}

				const start = process.hrtime.bigint()
				localdevState.terminalUpdater.updateTerminal({
					force: true,
					updateOverflowedLines: true,
				})
				const end = process.hrtime.bigint()
				console.info(
					`Refreshed terminal in ${prettyMilliseconds(
						Number(end - start) / 1_000_000
					)}`
				)
			}),
		{ hidden: true }
	),
	defineCommandSpec(
		createCommand('help')
			.argument('[command]')
			.summary('open the help pane')
			.action((command?: string) => {
				localdevState.activeHelpCommand = command ?? null
				localdevState.activeCommandBoxPaneComponent = ref(HelpPane)
			})
	),
	defineCommandSpec(
		createCommand('status')
			.summary('display the statuses of running services')
			.action(() => {
				localdevState.activeCommandBoxPaneComponent = ref(ServiceStatusesPane)
			})
	),
	defineCommandSpec(
		createCommand('config')
			.summary('interact with the localdev config')
			.addCommand(
				createCommand('open')
					.summary('open the config file')
					.action(async () => {
						await open(`vscode://${localdevState.localdevConfigPath}`)
					})
			)
			.addCommand(
				createCommand('save')
					.summary('write the current localdev state to the config')
					.action(() => {
						// TODO: implement
					})
			)
			.addCommand(
				createCommand('reload')
					.summary('reload the config file')
					.description(
						'reloads the config file and resets the localdev state to that specified in the config file'
					)
					.action(() => {
						// TODO: implement
					})
			)
	),
	defineCommandSpec(
		createCommand('logs')
			.summary('retrieves and streams the logs of a dev service')
			.argument('<serviceId>')
			.action((serviceId: string) => {
				if (!Service.has(serviceId)) {
					console.error(`Service ${serviceId} does not exist.`)
					return
				}

				// We update the active command box pane component first so we don't need to recompute the logs
				localdevState.activeCommandBoxPaneComponent = ref(LogsPane)

				// replaceLogs({ serviceId })

				localdevState.logsBoxServiceId = serviceId
			})
			.addCommand(
				createCommand('add')
					.argument('<serviceId>')
					.summary('add a service to the home view logs')
					.action((serviceId: string) => {
						if (!Service.has(serviceId)) {
							console.error(`Service ${serviceId} does not exist.`)
							return
						}

						localdevState.localdevConfig.servicesToLog ??= {}
						localdevState.localdevConfig.servicesToLog[serviceId] = true
					})
			)
			.addCommand(
				createCommand('remove')
					.argument('<serviceId>')
					.summary('remove a service from the home view logs')
					.action((serviceId: string) => {
						if (localdevState.localdevConfig.servicesToLog !== undefined) {
							localdevState.localdevConfig.servicesToLog[serviceId] = false
						}
					})
			)
	),
	defineCommandSpec(
		createCommand('hijack')
			.summary('hijacks a dev service')
			.description(
				'forwards standard input and control sequences (such as Ctrl+C) to a service'
			)
			.argument('<serviceId>')
			.action((serviceId: string) => {
				if (!Service.has(serviceId)) {
					console.error(`Service ${serviceId} does not exist.`)
					return
				}

				localdevState.hijackedServiceId = serviceId

				// We update the active command box pane component first so we don't need to recompute the logs
				localdevState.activeCommandBoxPaneComponent = ref(HijackPane)

				// replaceLogs({ serviceId })
			})
	),
	defineCommandSpec(
		createCommand('start')
			.summary('start a service')
			.argument('<serviceId>')
			.action(async (serviceId: string) => {
				if (!Service.has(serviceId)) {
					console.error(`Service ${serviceId} does not exist.`)
					return
				}

				console.info(`Starting service ${serviceId}`)
				const service = Service.get(serviceId)

				await service.run()
			})
	),
	defineCommandSpec(
		createCommand('restart')
			.summary('restart a service')
			.argument('<serviceId>')
			.action((serviceId: string) => {
				if (!Service.has(serviceId)) {
					console.error(`Service ${serviceId} does not exist.`)
					return
				}

				console.info(`Restarted service ${serviceId}`)
				const service = Service.get(serviceId)
				service.restart()
			})
	),
	defineCommandSpec(
		createCommand('stop')
			.summary('stop a service')
			.argument('<serviceId>')
			.action((serviceId: string) => {
				if (!Service.has(serviceId)) {
					console.error(`Service ${serviceId} does not exist.`)
					return
				}

				console.info(`Stopped service ${serviceId}`)
				const service = Service.get(serviceId)
				service.stop()
			})
	),
	defineCommandSpec(
		createCommand('clear')
			.summary('clear logs')
			.action(() => {
				clearLogs()
			})
	),
	defineCommandSpec(
		createCommand('home')
			.summary('return to the localdev home page')
			.action(() => {
				localdevState.activeCommandBoxPaneComponent = ref(ServiceStatusesPane)
				localdevState.logsBoxServiceId = null
			})
	),
	defineCommandSpec(
		createCommand('quit')
			.summary('quit localdev')
			.action(() => {
				process.stderr.write('\n')
				process.exit(0)
			})
	),
]

export const getLocaldevCommandSpecs: () => LocaldevCommandSpec[] = onetime(
	() => [
		...(localdevState.localdevConfig.commands?.({
			defineCommandSpec,
			createCommand,
			Command,
			spawnProcess,
		}) ?? []),
		...defaultCommandSpecs,
	]
)
