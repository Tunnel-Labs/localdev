import chalk from 'chalk'
import { Box, Text } from 'ink'

import { localdevConfig } from '~/utils/config.js'
import { useReactiveState } from '~/utils/reactivity.js'
import { Service } from '~/utils/service.js'
import { localdevStore } from '~/utils/store.js'

export function ServiceStatusesPane() {
	const services = useReactiveState(() => {
		const serviceIds = localdevStore.servicesEnabled
			? Object.keys(localdevConfig.value.services ?? {})
			: []
		return serviceIds.map((serviceId) => {
			const service = Service.get(serviceId)
			return {
				id: serviceId,
				name: service.name,
				status: service.status,
			}
		})
	})

	const getServiceStatusCircle = (status: Service['status']) => {
		switch (status) {
			case 'ready': {
				return chalk.green('●')
			}

			case 'pending': {
				return chalk.yellow('●')
			}

			case 'failed': {
				return chalk.red('●')
			}

			case 'stopped': {
				return chalk.dim('●')
			}

			default: {
				throw new Error(`unknown status ${String(status)}`)
			}
		}
	}

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
	)
}
