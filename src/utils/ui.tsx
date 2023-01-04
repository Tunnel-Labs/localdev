import TextInput from '@leondreamed/ink-text-input'
import chalk from 'chalk'
import type { DOMElement } from 'ink'
import { Box, measureElement, Text, useInput } from 'ink'
import { useEffect, useRef } from 'react'

import {
	runCommandFromCommandBox,
	selectNextCommand,
	selectPreviousCommand,
} from '~/utils/command.js'
import { useReactiveState } from '~/utils/reactivity.js'
import { localdevState } from '~/utils/store.js'
import { useTerminalSize } from '~/utils/terminal.js'

/**
	Note: Do **not** log anything inside the component, because logs trigger state updates (since we display them in the logs box).

	Instead, write your logs inside a `useEffect` to prevent infinite re-rendering
*/
export function LocaldevUi(props: { mode: string }) {
	const logsBoxRef = useRef<DOMElement>(null)
	const terminalSize = useTerminalSize()
	const state = useReactiveState(() => ({
		logsBoxIncludingTopLineHeight: localdevState.logsBoxIncludingTopLineHeight,
		activeCommandBoxPaneComponent: localdevState.activeCommandBoxPaneComponent,
		hijackedServiceId: localdevState.hijackedServiceId,
		wrappedLogLinesToDisplay: localdevState.wrappedLogLinesToDisplay,
		commandBoxInput: localdevState.commandBoxInput,
	}))

	const terminalHeight = terminalSize.rows
	const terminalWidth = terminalSize.columns

	useInput(async (string, key) => {
		if (key.ctrl && string === 'c') {
			// Write a newline to prevent the last line of the UI from being deleted
			process.stderr.write('\n')
			process.exit(0)
		}

		if (key.return) {
			await runCommandFromCommandBox()
		} else if (key.upArrow) {
			selectPreviousCommand()
		} else if (key.downArrow) {
			selectNextCommand()
		} else if (key.escape) {
			if (localdevState.activeCommandBoxPaneComponent === null) {
				localdevState.commandBoxInput = ''
			} else {
				localdevState.activeCommandBoxPaneComponent = null
			}
		}
	})

	useEffect(() => {
		// We delay the measurement until the next tick so that Ink gets a chance to render the component before we measure the logs box height
		setTimeout(() => {
			if (logsBoxRef.current !== null) {
				const { height } = measureElement(logsBoxRef.current)
				localdevState.logsBoxIncludingTopLineHeight = height + 1
			}
		}, 0)
	}, [
		logsBoxRef.current,
		// The logs box should resize whenever the active command box pane is changed
		state.activeCommandBoxPaneComponent,
	])

	const getWrappedLogLinesToDisplay = () => {
		if (state.logsBoxIncludingTopLineHeight === null) return []

		// If the log scroll mode state is active, we want to make sure we only render the logs that
		// were displayed when the scroll mode state became active to make the logs continuous when the user
		// scrolls up
		// if (logScrollModeState.active) {
		// 	return wrappedLogLines.slice(
		// 		logScrollModeState.wrappedLogLinesLength -
		// 			logsBoxIncludingTopLineHeight,
		// 		logScrollModeState.wrappedLogLinesLength
		// 	)
		// } else {
		return state.wrappedLogLinesToDisplay.slice(
			-state.logsBoxIncludingTopLineHeight
		)
		// }
	}

	return (
		<Box
			flexDirection="column"
			position="relative"
			height={terminalHeight}
			width={terminalWidth}
		>
			{/* We hide the title when the logs overflow so that the logs are unbroken when the user scrolls up to view overflowed logs */}
			{(state.logsBoxIncludingTopLineHeight === null ||
				state.wrappedLogLinesToDisplay.length <=
					state.logsBoxIncludingTopLineHeight - 1) && (
				<Box alignSelf="center" flexDirection="row">
					<Text bold>localdev</Text>
					<Text> </Text>
					<Text dimColor>[{props.mode}]</Text>
				</Box>
			)}

			<Box
				ref={logsBoxRef}
				flexDirection="column"
				justifyContent="flex-end"
				flexGrow={1}
			>
				{getWrappedLogLinesToDisplay().map((logLine, i) => (
					<Text key={i} wrap="truncate">
						{logLine}
					</Text>
				))}
			</Box>

			<Box borderStyle="round" flexDirection="column" flexShrink={0}>
				{state.activeCommandBoxPaneComponent !== null && (
					<Box flexDirection="column">
						<state.activeCommandBoxPaneComponent />
						<Text dimColor>{'─'.repeat(terminalWidth - 2)}</Text>
					</Box>
				)}
				{/* When hijacking a service, we disable the text input box since we want to forward all input to the hijacked service */}
				{state.hijackedServiceId === null && (
					<TextInput.default
						value={state.commandBoxInput}
						onChange={(input) => {
							localdevState.commandBoxInput = input
						}}
						placeholder={`Type ${chalk.bold(
							'help'
						)} and press enter for a list of commands`}
					/>
				)}
			</Box>
		</Box>
	)
}
