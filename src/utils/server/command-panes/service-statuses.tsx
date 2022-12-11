import chalk from 'chalk'
import { Box, Text } from 'ink'
import { useZustand } from 'use-zustand'

import type { DevServiceData } from '~/types/service.js'
import { localdevServerStore } from '~/utils/server/store.js'
import { getDevServiceName } from '~/utils/service/name.js'

export function ServiceStatusesPane() {
	const devServicesData = useZustand(
		localdevServerStore,
		(state) => state.devServicesData
	)

	const getDevServiceStatusCircle = (status: DevServiceData['status']) => {
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

			case 'unknown': {
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
					{chalk.red('●')} Failed, {chalk.dim('●')} Unknown)
				</Text>
			</Box>
			{Object.entries(devServicesData).map(
				([devServiceName, devServiceData]) => (
					<Box key={devServiceName} flexDirection="row">
						<Text>
							{` ${getDevServiceStatusCircle(devServiceData.status)} `}
						</Text>
						<Text>
							{getDevServiceName({ devServiceSpec: devServiceData.spec })}
						</Text>
					</Box>
				)
			)}
		</Box>
	)
}
