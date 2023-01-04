/* eslint-disable no-control-regex -- We want to match ANSI escape sequences */

import ansiEscapes from 'ansi-escapes'
import chalk from 'chalk'
import { either, flags } from 'compose-regexp'
import type { IBasePtyForkOptions } from 'node-pty'
import shellQuote from 'shell-quote'
import waitPort from 'wait-port'

import type { ServiceSpec } from '~/types/config.js'
import type { LogsAddedEventPayload } from '~/types/process.js'
import {
	getServicePrefixColor,
	getWrappedLogLinesToDisplay,
	serviceIdsToLog,
	wrapLineWithPrefix,
} from '~/utils/logs.js'
import { Process } from '~/utils/process.js'
import { localdevState } from '~/utils/store.js'

type ServiceStatus = 'ready' | 'pending' | 'failed' | 'unknown'

const _ansiCursorRegexp = flags.add(
	'g',
	either(
		// Moving the cursor in a certain direction
		/\u001B\[-?\d+([A-DG])/,
		// Moving the cursor to a certain coordinate
		/\u001B\d+;\d+H/,
		ansiEscapes.clearScreen,
		ansiEscapes.clearTerminal,
		ansiEscapes.cursorGetPosition,
		ansiEscapes.cursorHide,
		ansiEscapes.cursorLeft,
		ansiEscapes.cursorNextLine,
		ansiEscapes.cursorPrevLine,
		ansiEscapes.cursorRestorePosition,
		ansiEscapes.cursorSavePosition,
		ansiEscapes.cursorShow
	)
)

export class Service {
	static get(serviceId: string) {
		const service = Service.#servicesMap.get(serviceId)
		if (service === undefined) {
			throw new Error(
				`Could not find a \`Service\` instance for service with ID ${serviceId}`
			)
		}

		return service
	}

	static has(serviceId: string) {
		return Service.#servicesMap.has(serviceId)
	}

	/**
		Map from service ID to a `Service` instance
	*/
	static #servicesMap = new Map<string, Service>()
	spec: ServiceSpec
	#process: Process

	get process() {
		return this.#process
	}

	#status: Ref<ServiceStatus> = ref('pending')

	constructor(id: '$localdev')
	constructor(id: string, spec: Omit<ServiceSpec, 'id'>)
	constructor(id: string, spec?: Omit<ServiceSpec, 'id'>) {
		if (Service.#servicesMap.has(id)) {
			throw new Error(
				`A \`Service\` instance has already been created for service with ID ${id}`
			)
		}

		Service.#servicesMap.set(id, this)

		if (id === '$localdev') {
			this.spec = {
				id: '$localdev',
				// @ts-expect-error: Only the $localdev service can have a command that is `null`
				command: null,
			}

			this.#process = new Process({
				id: '$localdev',
				// @ts-expect-error: Only the $localdev service can have a command that is `null`
				command: null,
			})
		} else {
			// @ts-expect-error: Correct type
			this.spec = { ...spec, id }

			let command: string[]
			let commandOptions: IBasePtyForkOptions = {}

			if ('string' in this.spec.command) {
				command = shellQuote.parse(this.spec.command.string) as string[]
			} else {
				command = [
					'pnpm',
					`--filter=${this.spec.command.packageName}`,
					'run',
					this.spec.command.commandName,
				]
				commandOptions = {}
			}

			this.#process = new Process({
				id: this.spec.id,
				command,
				commandOptions,
			})
		}
	}

	get status() {
		return this.#status.value
	}

	set status(status: ServiceStatus) {
		this.#status.value = status
	}

	initialize() {
		if (this.spec.id !== '$localdev') {
			throw new Error(
				'initialize() can only be called on the $localdev service'
			)
		}

		const currentListenersMap = new Map<
			string,
			(payload: LogsAddedEventPayload) => void
		>()

		// Whenever `serviceIdsToLog` changes, we need to re-calculate `wrappedLogLinesToDisplay` and re-add all listeners
		subscribe(
			localdevState.serviceIdsToLog,
			() => {
				// Clear all old listeners
				for (const [
					oldServiceIdToLog,
					listener,
				] of currentListenersMap.entries()) {
					Service.get(oldServiceIdToLog).process.emitter.removeListener(
						'logsAdded',
						listener
					)
				}

				currentListenersMap.clear()

				// We re-calculate all log lines
				localdevState.wrappedLogLinesToDisplay = getWrappedLogLinesToDisplay()

				// We set up listeners for incremental addition to the log lines on new lines
				for (const serviceId of serviceIdsToLog.value) {
					const service = Service.get(serviceId)
					const listener = ({
						unwrappedLine,
						wrappedLine,
					}: LogsAddedEventPayload) => {
						let wrappedLines: string[]
						// If we're logging multiple services, we need to add a prefix to every wrapped line
						if (localdevState.logsBoxServiceId === null) {
							const prefix = `${chalk[getServicePrefixColor(service.spec.id)](
								service.name
							)}: `
							wrappedLines = wrapLineWithPrefix({ unwrappedLine, prefix })
						} else {
							wrappedLines = wrappedLine
						}

						localdevState.wrappedLogLinesToDisplay.push(...wrappedLines)
					}

					service.process.emitter.on('logsAdded', listener)
					currentListenersMap.set(serviceId, listener)
				}
			},
			{ immediate: true }
		)
	}

	get name() {
		return this.spec.name ?? this.spec.id
	}

	async waitForHealthy() {
		if (this.spec.healthCheck === undefined) return
		await waitPort({
			port: this.spec.healthCheck.port,
			path: this.spec.healthCheck.path,
			output: 'silent',
		})
	}

	restart() {
		this.status = 'pending'
		this.process.restart()

		if (this.spec.healthCheck === undefined) {
			this.status = 'ready'
		} else {
			this.waitForHealthy()
				.then(() => {
					this.status = 'ready'
				})
				.catch((error) => {
					console.error(error)
					this.status = 'failed'
				})
		}
	}

	stop() {
		this.status = 'failed'
		this.process.stop()
	}

	async run({ mode }: { mode: 'test' | 'development' }) {
		// If we need to wait on another command, then we wait for the other command to be ready before creating the pty process
		if (this.spec.dependsOn !== undefined) {
			const dependsOnSpecs = this.spec.dependsOn.map(
				(serviceId) => Service.get(serviceId).spec
			)

			await Promise.all(
				dependsOnSpecs.map(async (dependsOnSpec) => {
					const localdevLogs = Service.get('$localdev')
					localdevLogs.process.addLogs(
						`${this.name} is waiting for ${
							Service.get(dependsOnSpec.id).name
						} to become healthy...`
					)
					await Service.get(dependsOnSpec.id).waitForHealthy()
				})
			)
		}

		if (this.spec.healthCheck === undefined) {
			this.status = 'ready'
		} else {
			this.waitForHealthy()
				.then(() => {
					this.status = 'ready'
				})
				.catch((error) => {
					console.error(error)
					this.status = 'failed'
				})
		}

		this.process.spawn({ mode })
	}
}
