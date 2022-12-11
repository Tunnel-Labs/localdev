import chalk from 'chalk'
import { Box, Text } from 'ink'

import { localdevCommandSpecs } from '../commands.js'

export function HelpPane() {
	const commandsList = localdevCommandSpecs
		.map(
			(commandSpec) =>
				`${commandSpec.command.name()} - ${chalk.dim(
					commandSpec.command.description()
				)}`
		)
		.join('\n')

	return (
		<Box flexDirection="column" paddingX={1}>
			<Text>{commandsList}</Text>
		</Box>
	)
}
