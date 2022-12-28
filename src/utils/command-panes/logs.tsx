import ansiAlign from 'ansi-align'
import chalk from 'chalk'
import { Box, Text } from 'ink'
import { outdent } from 'outdent'

import { useReactiveState } from '~/utils/reactivity.js'
import { Service } from '~/utils/service.js'
import { localdevStore } from '~/utils/store.js'

/**
	The logs pane just informs the user that logs are being streamed (the logs themselves aren't displayed in the logs pane, but rather in the logs box)
*/
export function LogsPane() {
	const { logsBoxServiceId } = useReactiveState(() => ({
		logsBoxServiceId: localdevStore.logsBoxServiceId,
	}))

	// The logs pane should not be displayed if `logsBoxServiceId` is null
	if (logsBoxServiceId === null) {
		return null
	}

	return (
		<Box flexDirection="column" alignItems="center">
			<Text>
				{ansiAlign.center(outdent`
					Streaming logs of service ${chalk.italic(Service.get(logsBoxServiceId).name)}
					${chalk.dim(`Run ${chalk.bold('home')} to return home`)}
				`)}
			</Text>
		</Box>
	)
}
