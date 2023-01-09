import chalk from 'chalk'
import { Box, Text } from 'ink'
import { useSnapshot } from 'valtio'

import { getLocaldevCommandSpecs } from '~/utils/commands.js'
import { localdevState } from '~/utils/store.js'

export function HelpPane() {
	const { activeHelpCommand } = useSnapshot(localdevState)

	let commandHelpOutput: string
	if (activeHelpCommand === null) {
		commandHelpOutput = getLocaldevCommandSpecs()
			.filter((spec) => !spec.hidden)
			.map(
				(commandSpec) =>
					`${commandSpec.command.name()} - ${chalk.dim(
						commandSpec.command.summary()
					)}`
			)
			.join('\n')
	} else {
		commandHelpOutput =
			getLocaldevCommandSpecs()
				.find(({ command }) => command.name() === activeHelpCommand)
				?.command.helpInformation() ?? 'Command not found'
	}

	return (
		<Box flexDirection="column" paddingX={1}>
			<Text>{commandHelpOutput}</Text>
			{activeHelpCommand === null && (
				<Text>
					Type `help &lt;command&gt;` for more information about a specific
					command!
				</Text>
			)}
		</Box>
	)
}
