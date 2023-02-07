import TextInput from '@leondreamed/ink-text-input'
import chalk from 'chalk'
import type { DOMElement } from 'ink'
import { Box, measureElement, Text, useInput } from 'ink'
import React, { createElement, useEffect, useRef } from 'react'

import {
	runCommandFromCommandBox,
	selectNextCommand,
	selectPreviousCommand,
} from '~/utils/command.js'
import { localdevState, useLocaldevSnapshot } from '~/utils/state.js'
import { useTerminalSize } from '~/utils/terminal.js'

function LocaldevLogsBox() {
	const { logsBoxVirtualTerminalOutput } = useLocaldevSnapshot()

	return (
		<Box>
			<Text>{logsBoxVirtualTerminalOutput}</Text>
		</Box>
	)
}

/**
	Note: Be careful to **not** log anything inside the component, because logs trigger state updates (since we display them in the logs box).

	Instead, write your logs inside a `useEffect` to prevent infinite re-rendering
*/
export function LocaldevUi() {
	const logsBoxRef = useRef<DOMElement>(null)
	const terminalSize = useTerminalSize()
	const {
		logsBoxHeight,
		activeCommandBoxPaneComponent,
		hijackedServiceId,
		commandBoxInput,
	} = useLocaldevSnapshot()

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
				localdevState.logsBoxHeight = height
			}
		}, 50)
	}, [
		logsBoxRef.current,
		// The logs box should resize whenever the active command box pane is changed
		activeCommandBoxPaneComponent,
		// The logs box should resize whenever the terminal is resized
		terminalHeight,
		terminalWidth,
	])

	return (
		<Box
			flexDirection="column"
			position="relative"
			height={terminalHeight}
			width={terminalWidth}
		>
			<Box ref={logsBoxRef} flexGrow={1}>
				{logsBoxHeight !== null && <LocaldevLogsBox />}
			</Box>

			<Box borderStyle="round" flexDirection="column" flexShrink={0}>
				{activeCommandBoxPaneComponent !== null && (
					<Box flexDirection="column">
						{createElement(activeCommandBoxPaneComponent)}
						<Text dimColor>{'─'.repeat(terminalWidth - 2)}</Text>
					</Box>
				)}
				{/* When hijacking a service, we disable the text input box since we want to forward all input to the hijacked service */}
				{hijackedServiceId === null && (
					<TextInput.default
						value={commandBoxInput}
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
