import { runDevelopmentScript } from '@dialect-inc/development-scripts'
import { Command } from 'commander'
import open from 'open'

import type { LocaldevCommandSpec } from '~/types/command.js'
import { spawnProcessFromDevService } from '~/utils/process.js'
import { HelpPane } from '~/utils/server/command-panes/help.jsx'
import { HijackPane } from '~/utils/server/command-panes/hijack.jsx'
import { LogsPane } from '~/utils/server/command-panes/logs.jsx'
import { ServiceStatusesPane } from '~/utils/server/command-panes/service-statuses.jsx'
import { localdevServerStore } from '~/utils/server/store.js'

function replaceLogs({ serviceId }: { serviceId: string }) {
	const { addLogLine, clearLogs, getDevServiceData } =
		localdevServerStore.getState()

	clearLogs()
	const devServiceData = getDevServiceData({
		devServiceId: serviceId
	})
	for (const logLine of devServiceData.logLines) {
		addLogLine(logLine)
	}
}

function defineCommandSpec(command: Command): LocaldevCommandSpec {
	return { command }
}

export const localdevCommandSpecs: LocaldevCommandSpec[] = [
	defineCommandSpec(
		new Command()
			.name('help')
			.description('open the help pane')
			.action(() => {
				const { setActiveCommandBoxPaneComponent } =
					localdevServerStore.getState()
				setActiveCommandBoxPaneComponent(HelpPane)
			})
	),
	defineCommandSpec(
		new Command()
			.name('status')
			.description('display the statuses of running services')
			.action(() => {
				const { setActiveCommandBoxPaneComponent } =
					localdevServerStore.getState()
				setActiveCommandBoxPaneComponent(ServiceStatusesPane)
			})
	),
	defineCommandSpec(
		new Command()
			.name('service')
			.argument('<service>')
			.addCommand(
				new Command()
					.name('logs')
					.description('retrieves and streams the logs of a dev service')
					.argument('<serviceId>')
					.action((serviceId: string) => {
						const { setActiveCommandBoxPaneComponent } =
							localdevServerStore.getState()
						// We update the active command box pane component first so we don't need to recompute the logs
						setActiveCommandBoxPaneComponent(LogsPane)
						replaceLogs({ serviceId })
					})
			)
			.addCommand(
				new Command()
					.name('hijack')
					.description(
						'hijacks a dev service, forwarding standard input and control sequences (such as Ctrl+C)'
					)
					.argument('<serviceId>')
					.action((serviceId: string) => {
						const { setActiveCommandBoxPaneComponent } =
							localdevServerStore.getState()
						const { setHijackedServiceId } = localdevServerStore.getState()
						setHijackedServiceId(serviceId)
						// We update the active command box pane component first so we don't need to recompute the logs
						setActiveCommandBoxPaneComponent(HijackPane)
						replaceLogs({ serviceId })
					})
			)
			.addCommand(
				new Command()
					.name('restart')
					.description('restart a service')
					.argument('<serviceId>')
					.action((serviceId: string) => {
						const { updateDevServiceData, getDevServiceData } =
							localdevServerStore.getState()
						const { spec } = getDevServiceData({ devServiceId: serviceId })
						const ptyProcess = spawnProcessFromDevService({
							devServiceSpec: spec,
							mode: 'development'
						})
						updateDevServiceData({
							devServiceId: serviceId,
							devServiceDataUpdates: { ptyProcess }
						})
					})
			)
	),
	defineCommandSpec(
		new Command()
			.name('clear')
			.description('clear logs')
			.action(() => {
				const { clearLogs } = localdevServerStore.getState()
				clearLogs()
			})
	),
	defineCommandSpec(
		new Command()
			.name('open')
			.description('quickly open various DialectInc services')
			.argument('<serviceName>')
			.action(async (serviceName: string) => {
				if (serviceName === 'docs') {
					const devDocsLink = 'https://internal-docs.dialect.test'
					await open(devDocsLink)
				}
			})
	),
	defineCommandSpec(
		new Command()
			.name('migration')
			.description('migration utilities for the Prisma database')
			.addCommand(
				new Command()
					.name('create')
					.description(
						'creates a Prisma migration file without migrating the database'
					)
					.action(async () => {
						await runDevelopmentScript({
							developmentScriptSlug: 'database/create-prisma-migration-file'
						})
					})
			)
			.addCommand(
				new Command()
					.name('apply')
					.description('applies all Prisma migrations to the database')
					.action(async () => {
						await runDevelopmentScript({
							developmentScriptSlug: 'database/apply-prisma-migrations'
						})
					})
			)
			.addCommand(
				new Command()
					.name('change-status')
					.description(
						'change the applied status of a Prisma migration in the database'
					)
					.action(async () => {
						await runDevelopmentScript({
							developmentScriptSlug: 'database/change-prisma-migration-status'
						})
					})
			)
			.addCommand(
				new Command()
					.name('execute')
					.description('execute a Prisma migration')
					.action(async () => {
						await runDevelopmentScript({
							developmentScriptSlug: 'database/execute-prisma-migration'
						})
					})
			)
	),
	defineCommandSpec(
		new Command()
			.name('test')
			.description('run tests')
			.option(
				'-i, --interactive',
				'run tests interactively using the Cypress UI',
				true
			)
			.option(
				'-h, --headless',
				'run tests headlessly using the Cypress CLI',
				false
			)
			.action(async (options: { headless: boolean; interactive: boolean }) => {
				if (options.interactive) {
					await runDevelopmentScript({
						developmentScriptSlug: 'test/run-tests-interactively'
					})
				} else {
					await runDevelopmentScript({
						developmentScriptSlug: 'test/run-tests-headlessly'
					})
				}
			})
	),
	defineCommandSpec(
		new Command()
			.name('quit')
			.description('quit localdev')
			.action(() => {
				process.exit(0)
			})
	)
]
