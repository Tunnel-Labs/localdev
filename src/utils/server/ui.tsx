import { getLocaldevConfig } from '@dialect-inc/localdev-config'
import chalk from 'chalk'
import type { DOMElement } from 'ink'
import { Box, measureElement, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useEffect, useRef } from 'react'
import { useZustand } from 'use-zustand'

import { setupLocaldevServer } from '~/utils/server/setup.js'
import { localdevServerStore } from '~/utils/server/store.js'
import { runDevService } from '~/utils/service/run.js'
import { TerminalUpdater, useTerminalSize } from '~/utils/terminal.js'

export function LocaldevServer({ mode }: { mode: string }) {
	const logsBoxRef = useRef<DOMElement>(null)
	const terminalSize = useTerminalSize()
	const {
		wrappedLogLines,
		logsBoxIncludingTopLineHeight,
		setLogsBoxIncludingTopLineHeight,
		setActiveCommandBoxPaneComponent,
		activeCommandBoxPaneComponent: ActiveCommandBoxPane,
		hijackedServiceId,
		commandBoxInput,
		setCommandBoxInput,
		runCommandInCommandBox,
		selectPreviousCommand,
		selectNextCommand
	} = useZustand(
		localdevServerStore,
		({
			wrappedLogLines,
			logsBoxIncludingTopLineHeight,
			setLogsBoxIncludingTopLineHeight,
			setActiveCommandBoxPaneComponent,
			activeCommandBoxPaneComponent,
			hijackedServiceId,
			commandBoxInput,
			setCommandBoxInput,
			runCommandInCommandBox,
			selectPreviousCommand,
			selectNextCommand,
			activateLogScrollMode,
			deactivateLogScrollMode
		}) => ({
			wrappedLogLines,
			logsBoxIncludingTopLineHeight,
			setLogsBoxIncludingTopLineHeight,
			setActiveCommandBoxPaneComponent,
			activeCommandBoxPaneComponent,
			hijackedServiceId,
			commandBoxInput,
			setCommandBoxInput,
			runCommandInCommandBox,
			selectPreviousCommand,
			selectNextCommand,
			activateLogScrollMode,
			deactivateLogScrollMode
		})
	)

	const terminalHeight = terminalSize.rows
	const terminalWidth = terminalSize.columns

	useInput(async (_, key) => {
		if (key.return) {
			await runCommandInCommandBox()
		} else if (key.upArrow) {
			selectPreviousCommand()
		} else if (key.downArrow) {
			selectNextCommand()
		} else if (key.escape) {
			if (ActiveCommandBoxPane === null) {
				setCommandBoxInput('')
			} else {
				setActiveCommandBoxPaneComponent(null)
			}
		}
	})

	useEffect(() => {
		if (logsBoxRef.current !== null) {
			const { height } = measureElement(logsBoxRef.current)
			setLogsBoxIncludingTopLineHeight(height + 1)
		}
	}, [
		logsBoxRef.current,
		// The logs box should resize whenever the active command box pane is changed
		ActiveCommandBoxPane
	])

	const getWrappedLogLinesToDisplay = () => {
		if (logsBoxIncludingTopLineHeight === null) return []

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
		return wrappedLogLines.slice(-logsBoxIncludingTopLineHeight)
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
			{(logsBoxIncludingTopLineHeight === null ||
				wrappedLogLines.length <= logsBoxIncludingTopLineHeight - 1) && (
				<Box alignSelf="center" flexDirection="row">
					<Text bold>localdev</Text>
					<Text> </Text>
					<Text dimColor>[{mode}]</Text>
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
				{ActiveCommandBoxPane !== null && (
					<Box flexDirection="column">
						<ActiveCommandBoxPane />
						<Text dimColor>{'─'.repeat(terminalWidth - 2)}</Text>
					</Box>
				)}
				{/* When hijacking a service, we disable the text input box since we want to forward all input to the hijacked service */}
				{hijackedServiceId === null && (
					<TextInput.default
						value={commandBoxInput}
						onChange={setCommandBoxInput}
						placeholder={`Type ${chalk.bold(
							'help'
						)} and press enter for a list of commands`}
					/>
				)}
			</Box>
		</Box>
	)
}

export async function renderLocaldevServer(options: {
	mode: 'development' | 'test'
}) {
	await setupLocaldevServer()

	const { setLocaldevConfig, updateDevServiceData, setTerminalUpdater } =
		localdevServerStore.getState()
	const localdevConfig = await getLocaldevConfig()
	setLocaldevConfig(localdevConfig)

	for (const devServiceSpec of localdevConfig.devServiceSpecs) {
		runDevService({
			mode: options.mode,
			devServiceSpec,
			fromConfig: true
		}).catch(() => {
			updateDevServiceData({
				devServiceId: devServiceSpec.id,
				devServiceDataUpdates: { status: 'failed' }
			})
		})
	}

	const terminalUpdater = new TerminalUpdater({ mode: options.mode })
	setTerminalUpdater(terminalUpdater)

	terminalUpdater.start()
}
