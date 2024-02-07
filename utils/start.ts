import defaults from 'defaults';
import { asyncExitHook } from 'exit-hook';
import killPort from 'kill-port';
import fs from 'node:fs';
import path from 'node:path';
import { ref } from 'valtio';
import type { StartLocaldevOptions } from '../types/options.js';
import {
	getLocaldevConfig,
	getLocaldevConfigPath,
	getLocaldevLocalConfigPath,
} from '../utils/config.js';
import { Service } from '../utils/service.js';
import { setupLocaldevServer } from '../utils/setup.js';
import { localdevState } from '../utils/state.js';
import { TerminalUpdater } from '../utils/terminal.js';

export async function startLocaldev(options?: StartLocaldevOptions) {
	options = defaults(options ?? {}, {
		force: false,
		proxyOnly: false,
	});

	if (options.force) {
		await killPort(
			options.port === undefined ? 7357 : Number(options.port),
		);
	}

	localdevState.localdevConfigPath = await getLocaldevConfigPath({
		configPath: options.config,
		projectPath: options.project,
	});
	localdevState.projectPath = options.project ??
		path.dirname(localdevState.localdevConfigPath);
	localdevState.localdevLocalConfigPath = await getLocaldevLocalConfigPath({
		projectPath: options.project,
		localConfigPath: options.localConfig,
	});
	localdevState.localdevConfig = await getLocaldevConfig({
		configPath: localdevState.localdevConfigPath,
		localConfigPath: localdevState.localdevLocalConfigPath,
	});
	localdevState.localdevFolder = fs.existsSync(
			path.join(localdevState.projectPath, 'node_modules'),
		) ?
		path.join(localdevState.projectPath, 'node_modules/.localdev') :
		path.join(localdevState.projectPath, '.localdev');

	await fs.promises.rm(path.join(localdevState.localdevFolder, 'logs'), {
		recursive: true,
		force: true,
	});
	await fs.promises.mkdir(path.join(localdevState.localdevFolder, 'logs'), {
		recursive: true,
	});

	await setupLocaldevServer();
	const localdevService = new Service('$localdev');

	if (options.proxyOnly) {
		localdevState.servicesEnabled = false;
	} else {
		const services = [];
		for (
			const [serviceId, serviceSpec] of Object.entries(
				localdevState.localdevConfig.services ?? {},
			)
		) {
			services.push(new Service(serviceId, serviceSpec));
		}

		for (const service of services) {
			if (service.spec.startAutomatically) {
				service.run().catch((error) => {
					console.error(error);
					service.status = 'failed';
				});
			} else {
				service.status = 'stopped';
			}
		}
	}

	await localdevService.initialize();

	const terminalUpdater = new TerminalUpdater();
	localdevState.terminalUpdater = ref(terminalUpdater);

	terminalUpdater.start();

	asyncExitHook(
		async () => {
			await terminalUpdater.updateOverflowedLines();
		},
		{ minimumWait: 300 },
	);
}
