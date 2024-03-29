import chalk from 'chalk';
import { Box, Text } from 'ink';
import React from 'react';

import { type ServiceStatus } from '../types/service.js';
import { Service } from '../utils/service.js';
import { localdevState, useLocaldevSnapshot } from '../utils/state.js';

export function ServiceStatusesPane() {
	const snap = useLocaldevSnapshot();

	const serviceIds = snap.servicesEnabled ?
		Object.keys(localdevState.localdevConfig.services ?? {}) :
		[];

	const services = serviceIds.map((serviceId) => {
		const service = Service.get(serviceId);
		return {
			id: serviceId,
			name: service.name,
			status: service.status,
		};
	});

	const getServiceStatusCircle = (status: ServiceStatus) => {
		switch (status) {
			case 'ready': {
				return chalk.green('●');
			}

			case 'pending': {
				return chalk.yellow('●');
			}

			case 'failed': {
				return chalk.red('●');
			}

			case 'stopped': {
				return chalk.dim('●');
			}

			default: {
				throw new Error(`unknown status ${String(status)}`);
			}
		}
	};

	return (
		<Box flexDirection="column">
			<Box flexDirection="row">
				<Box marginRight={1} flexDirection="row">
					<Text underline bold>
						Service Statuses
					</Text>
				</Box>
				<Text dimColor>
					({chalk.green('●')} Ready, {chalk.yellow('●')} Pending,{' '}
					{chalk.red('●')} Failed, {chalk.dim('●')} Stopped)
				</Text>
			</Box>
			{services.map((service) => (
				<Box key={service.id} flexDirection="row">
					<Text>{` ${getServiceStatusCircle(service.status)} `}</Text>
					<Text>{service.name}</Text>
				</Box>
			))}
		</Box>
	);
}
