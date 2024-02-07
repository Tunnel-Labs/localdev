/* eslint-disable no-control-regex -- We want to match ANSI escape sequences */

import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import { either, flags } from 'compose-regexp';
import type { IBasePtyForkOptions } from 'node-pty';
import shellQuote from 'shell-quote';
import invariant from 'tiny-invariant';
import { subscribeKey } from 'valtio/utils';
import waitPort from 'wait-port';

import type { ServiceSpec } from '../types/config.js';
import { type UnwrappedLogLineData } from '../types/logs.js';
import { type ServiceStatus } from '../types/service.js';
import { getServicePrefixColor } from '../utils/logs.js';
import { Process } from '../utils/process.js';
import { localdevState } from '../utils/state.js';

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
		ansiEscapes.cursorShow,
	),
);

export class Service {
	static get(serviceId: string) {
		const service = Service.#servicesMap.get(serviceId);
		if (service === undefined) {
			throw new Error(
				`Could not find a \`Service\` instance for service with ID ${serviceId}`,
			);
		}

		return service;
	}

	static has(serviceId: string) {
		return Service.#servicesMap.has(serviceId);
	}

	/**
		Map from service ID to a `Service` instance
	*/
	static #servicesMap = new Map<string, Service>();
	spec: ServiceSpec;
	#process: Process;

	get process() {
		return this.#process;
	}

	constructor(id: '$localdev');
	constructor(id: string, spec: Omit<ServiceSpec, 'id'>);
	constructor(id: string, spec?: Omit<ServiceSpec, 'id'>) {
		if (Service.#servicesMap.has(id)) {
			throw new Error(
				`A \`Service\` instance has already been created for service with ID ${id}`,
			);
		}

		Service.#servicesMap.set(id, this);

		if (id === '$localdev') {
			this.spec = {
				id: '$localdev',
				// @ts-expect-error: Only the $localdev service can have a command that is `null`
				command: null,
			};

			this.#process = new Process({
				id: '$localdev',
				// @ts-expect-error: Only the $localdev service can have a command that is `null`
				command: null,
			});
		} else {
			// @ts-expect-error: Correct type
			this.spec = { ...spec, id };

			if (this.spec.startAutomatically) {
				this.status = 'pending';
			}

			let command: string[];
			const commandOptions: IBasePtyForkOptions = {};
			commandOptions.cwd = this.spec.command.cwd ?? localdevState.projectPath;

			if (this.spec.command.env !== undefined) {
				commandOptions.env = this.spec.command.env;
			}

			if ('string' in this.spec.command) {
				command = shellQuote.parse(this.spec.command.string) as string[];
			} else {
				command = [
					'pnpm',
					`--filter=${this.spec.command.packageName}`,
					'run',
					this.spec.command.commandName,
				];
			}

			localdevState.serviceStatuses[this.spec.id] = 'pending';
			this.#process = new Process({
				id: this.spec.id,
				command,
				commandOptions,
			});
			this.#process.emitter.on('exited', async (exitCode) => {
				if (exitCode === 0) {
					this.status = 'stopped';
				} else {
					this.status = 'failed';

					await Service.get('$localdev').process.addLogs(
						chalk.redBright(
							`Service "${this.name}" failed with exit code ${exitCode} (run \`logs ${this.name}\` to view error logs)`,
						),
					);
				}
			});
		}
	}

	get status() {
		const status = localdevState.serviceStatuses[this.spec.id];
		invariant(status !== undefined, 'status !== undefined');
		return status;
	}

	set status(status: ServiceStatus) {
		localdevState.serviceStatuses[this.spec.id] = status;
	}

	async initialize() {
		if (this.spec.id !== '$localdev') {
			throw new Error(
				'initialize() can only be called on the $localdev service',
			);
		}

		const currentListenersMap = new Map<
			string,
			(logLineData: UnwrappedLogLineData) => void
		>();

		const resetServiceListeners = async () => {
			// Clear all old listeners
			for (
				const [
					oldServiceIdToLog,
					listener,
				] of currentListenersMap.entries()
			) {
				Service.get(oldServiceIdToLog).process.emitter.removeListener(
					'logsAdded',
					listener,
				);
			}

			currentListenersMap.clear();
			await localdevState.terminalUpdater?.refreshLogs();

			// We set up listeners for incremental addition to the log lines on new lines
			for (const serviceId of localdevState.serviceIdsToLog) {
				const service = Service.get(serviceId);
				const logsAddedListener = async (
					unwrappedLogLineData: UnwrappedLogLineData,
				) => {
					if (localdevState.terminalUpdater === null) return;

					// We need to make sure that we don't re-add lines that have already been added by `refreshLogs`
					if (
						unwrappedLogLineData.id ===
							localdevState.terminalUpdater.virtualLogsTerminal
								.lastLogLineIdWritten
					) {
						return;
					}

					// If we're logging multiple services, we need to add a prefix to every wrapped line
					const prefix = localdevState.logsBoxServiceId === null ?
						`${
							chalk[getServicePrefixColor(service.spec.id)](
								service.name,
							)
						}: ` :
						undefined;

					await localdevState.terminalUpdater.virtualLogsTerminal
						.writeUnwrappedLog(
							unwrappedLogLineData,
							{ prefix },
						);
				};

				service.process.emitter.on('logsAdded', logsAddedListener);
				currentListenersMap.set(serviceId, logsAddedListener);
			}
		};

		subscribeKey(localdevState, 'serviceIdsToLog', async () => {
			await resetServiceListeners();
		});

		await resetServiceListeners();
	}

	get name() {
		return this.spec.name ?? this.spec.id;
	}

	async waitForHealthy() {
		if (typeof this.spec.healthCheck === 'function') {
			await this.spec.healthCheck(this);
		} else if (this.spec.healthCheck !== undefined) {
			await waitPort({
				port: this.spec.healthCheck.port,
				path: this.spec.healthCheck.path,
				output: 'silent',
			});
		}
	}

	restart() {
		this.status = 'pending';
		this.process.restart();

		this.waitForHealthy()
			.then(() => {
				this.status = 'ready';
			})
			.catch((error) => {
				console.error(error);
				this.status = 'failed';
			});
	}

	stop() {
		this.status = 'stopped';
		this.process.stop();
	}

	async run() {
		this.status = 'pending';

		// If we need to wait on another command, then we wait for the other command to be ready before creating the pty process
		if (this.spec.dependsOn !== undefined) {
			const dependsOnSpecs = this.spec.dependsOn.map(
				(serviceId) => Service.get(serviceId).spec,
			);

			await Promise.all(
				dependsOnSpecs.map(async (dependsOnSpec) => {
					const localdevLogs = Service.get('$localdev');
					const dependencyService = Service.get(dependsOnSpec.id);
					if (dependencyService.status !== 'ready') {
						await localdevLogs.process.addLogs(
							`${this.name} is waiting for ${dependencyService.name} to become healthy...\n`,
						);
						await dependencyService.waitForHealthy();
					}
				}),
			);
		}

		if (this.spec.healthCheck === undefined) {
			this.status = 'ready';
		} else {
			this.waitForHealthy()
				.then(() => {
					this.status = 'ready';
				})
				.catch((error) => {
					console.error(error);
					this.status = 'failed';
				});
		}

		await this.process.spawn();
	}
}
