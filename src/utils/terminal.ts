import { PassThrough } from 'node:stream'

import ansiEscapes from 'ansi-escapes'
import chalk from 'chalk'
import consoleClear from 'console-clear'
import { render } from 'ink'
import renderer from 'ink/build/renderer.js'
import throttle from 'just-throttle'
import patchConsole from 'patch-console'
import { useCallback, useEffect, useState } from 'react'
import React from 'react'
import onExit from 'signal-exit'
import terminalSize from 'term-size'
import invariant from 'tiny-invariant'

import { ServiceStatusesPane } from '~/utils/server/command-panes/service-statuses.jsx'
import { localdevServerStore } from '~/utils/server/store.js'
import { LocaldevServer } from '~/utils/server/ui.jsx'

export function onTerminalResize(cb: () => void) {
	process.on('SIGWINCH', cb)

	return () => {
		process.removeListener('SIGWINCH', cb)
	}
}

/**
	Copied from https://npm.im/cli-resize
	@see https://github.com/IonicaBizau/node-cli-resize/blob/master/lib/index.js
*/
export function useTerminalResize(cb: () => void) {
	useEffect(() => {
		onTerminalResize(cb)
	}, [cb])
}

export function useTerminalSize() {
	const [size, setSize] = useState(terminalSize())

	useTerminalResize(
		useCallback(() => {
			setSize(terminalSize())
		}, [])
	)

	return size
}

/**
	Tell the terminal to capture mouse events.
	@see https://github.com/Textualize/textual/blob/main/src/textual/drivers/linux_driver.py#L65
*/
export function enableTerminalMouseSupport() {
	process.stderr.write('\u001B[?1000h') // SET_VT200_MOUSE
	process.stderr.write('\u001B[?1003h') // SET_ANY_EVENT_MOUSE
	process.stderr.write('\u001B[?1015h') // SET_VT200_HIGHLIGHT_MOUSE
	process.stderr.write('\u001B[?1006h') // SET_SGR_EXT_MODE_MOUSE
}

/**
	Make the terminal no longer capture mouse events.
*/
export function disableTerminalMouseSupport() {
	process.stderr.write('\u001B[?1000l')
	process.stderr.write('\u001B[?1003l')
	process.stderr.write('\u001B[?1015l')
	process.stderr.write('\u001B[?1006l')
}

const SYNC_START = '\u001B[?2026h'
const SYNC_END = '\u001B[?2026l'
export class TerminalUpdater {
	previousOutput = ''
	hasPressAnyKeyToContinueNoticeBeenWritten = false
	updateIntervalId: NodeJS.Timer | undefined
	mode: string

	constructor({ mode }: { mode: 'development' | 'test' }) {
		this.mode = mode
	}

	start() {
		const { setActiveCommandBoxPaneComponent, setInkInstance } =
			localdevServerStore.getState()

		// Initially, we want to display the status of the services
		setActiveCommandBoxPaneComponent(ServiceStatusesPane)
		setInkInstance(
			render(React.createElement(LocaldevServer, { mode: this.mode }), {
				// We pass in a "noop stream" to Ink's `stdout` because we use our own rendering function for Ink (the built-in rendering function for Ink has flickering issues)
				// @ts-expect-error: not a perfect type match but works at runtime
				stdout: new PassThrough(),

				/**
					We use our own console patches.
				*/
				patchConsole: false
			})
		)

		patchConsole((stream, data) => {
			const { addLogLine } = localdevServerStore.getState()
			if (stream === 'stderr') {
				addLogLine(`${chalk.redBright('localdev error:')} ${data}`)
			} else {
				addLogLine(`${chalk.yellow('localdev log:')} ${data}`)
			}
		})

		consoleClear()
		process.stderr.write(ansiEscapes.cursorHide)
		const lines = '\n'.repeat(terminalSize().rows)

		// Since we're overwriting line-by-line, we want to initially make all lines a newline character
		process.stderr.write(lines)
		this.previousOutput = lines

		this.updateIntervalId = setInterval(this.updateTerminal.bind(this), 0)

		enableTerminalMouseSupport()
		onExit(() => {
			disableTerminalMouseSupport()
		})

		this.registerStdinListener()
		this.setTerminalResizeListeners()
		this.updateTerminal()
	}

	setTerminalResizeListeners() {
		/**
			When the terminal is resized, we recalculate the wrapped log lines to display.
		*/
		onTerminalResize(
			(throttle as unknown as typeof throttle['default'])(() => {
				// We need to clear the console in order to preserve the continuity of overflowed logs as the terminal resize causes some lines to overflow
				consoleClear()
				const { resetLogLines } = localdevServerStore.getState()
				resetLogLines()
				this.updateTerminal({ force: true })
			}, 200)
		)
	}

	updateTerminal(options?: {
		updateOverflowedLines?: boolean
		force?: boolean
	}) {
		const {
			inkInstance,
			logScrollModeState,
			nextOverflowedWrappedLogLineIndexToOutput,
			overflowedWrappedLogLines
		} = localdevServerStore.getState()

		if (logScrollModeState.active) {
			return
		}

		if (inkInstance.isUnmounted) {
			clearInterval(this.updateIntervalId)
			return
		}

		// If we want to force an update, prevent that the previous output was a bunch of empty newlines (so that our line-by-line updater will end up updating every line)
		if (options?.force) {
			this.previousOutput = '\n'.repeat(terminalSize().rows - 1)
		}

		/**
			The string we want to output to `process.stderr` to update the screen.
		*/
		let updateSequence = ''

		// If there are overflowed lines that need to be logged, then output them first
		if (
			options?.updateOverflowedLines &&
			nextOverflowedWrappedLogLineIndexToOutput <
				overflowedWrappedLogLines.length
		) {
			// Move the cursor to the top-left corner
			updateSequence += ansiEscapes.cursorTo(0, 0)

			const { rows: numTerminalRows } = terminalSize()
			let overflowedWrappedLogLineIndex =
				nextOverflowedWrappedLogLineIndexToOutput

			const numOverflowedWrappedLogLinesToOutput =
				overflowedWrappedLogLines.length -
				nextOverflowedWrappedLogLineIndexToOutput

			// Overwrite as many top lines with overflowed log lines as possible
			for (
				;
				overflowedWrappedLogLineIndex <
				Math.min(
					nextOverflowedWrappedLogLineIndexToOutput + numTerminalRows,
					overflowedWrappedLogLines.length
				);
				overflowedWrappedLogLineIndex += 1
			) {
				const overflowedWrappedLogLine =
					overflowedWrappedLogLines[overflowedWrappedLogLineIndex]
				invariant(
					overflowedWrappedLogLine,
					'`overflowedWrappedLogLine` is not undefined'
				)

				updateSequence +=
					// Replace the line with the overflowed line
					ansiEscapes.eraseLine +
					overflowedWrappedLogLine +
					// Move the cursor down and to the start
					ansiEscapes.cursorDown() +
					ansiEscapes.cursorTo(0)
			}

			let numEmptyLinesToOutput = 0
			// If there are still more overflowed lines that need to be outputted, append them to the update sequence
			if (overflowedWrappedLogLineIndex < overflowedWrappedLogLines.length) {
				updateSequence +=
					'\n' +
					overflowedWrappedLogLines
						.slice(overflowedWrappedLogLineIndex)
						.join('\n')

				numEmptyLinesToOutput = numTerminalRows - 1
			}
			// Otherwise, replace the rest of the lines with empty lines
			else {
				for (
					;
					overflowedWrappedLogLineIndex <= numTerminalRows;
					overflowedWrappedLogLineIndex += 1
				) {
					updateSequence +=
						ansiEscapes.eraseLine +
						ansiEscapes.cursorDown() +
						ansiEscapes.cursorTo(0)
				}

				numEmptyLinesToOutput = numOverflowedWrappedLogLinesToOutput
			}

			// Push the above lines outside the terminal viewport by outputting a bunch of empty lines
			const newlines = '\n'.repeat(numEmptyLinesToOutput)
			updateSequence += newlines

			// Set the previous output was an empty screen so that the viewport is completely re-rendered
			this.previousOutput = '\n'.repeat(numTerminalRows - 1)

			localdevServerStore.setState({
				nextOverflowedWrappedLogLineIndexToOutput:
					overflowedWrappedLogLines.length
			})
		}

		const newOutput = renderer.default(
			inkInstance.rootNode,
			terminalSize().columns
		).output

		if (newOutput === this.previousOutput) {
			return
		}

		const newLines = newOutput.split('\n')

		const previousLines =
			this.previousOutput === '' ? [] : this.previousOutput.split('\n')

		// To refresh the terminal display, we start at the top-left corner of the screen (this assumes that our output is full screen, which it is)
		updateSequence += ansiEscapes.cursorTo(0, 0)

		// We only manipulate the rows below the rows we want to overflow
		for (const [rowIndex, previousLine] of previousLines.entries()) {
			const rowLine = newLines[rowIndex]

			// `rowLine` might be undefined if the terminal is resized
			if (rowLine === undefined) {
				continue
			}

			if (rowLine !== previousLine) {
				updateSequence += ansiEscapes.eraseLine + rowLine
			}

			updateSequence += ansiEscapes.cursorDown() + ansiEscapes.cursorTo(0)
		}

		process.stderr.write(SYNC_START + updateSequence + SYNC_END)
		this.previousOutput = newOutput
	}

	registerStdinListener() {
		process.stdin.on('data', (inputBuffer) => {
			const {
				logScrollModeState,
				deactivateLogScrollMode,
				activateLogScrollMode
			} = localdevServerStore.getState()

			if (logScrollModeState.active) {
				const previousLines = this.previousOutput.split('\n')
				let updateSequence =
					ansiEscapes.cursorUp(previousLines.length) + ansiEscapes.cursorLeft
				for (const line of previousLines) {
					updateSequence += ansiEscapes.eraseLine + line
					updateSequence += ansiEscapes.cursorDown() + ansiEscapes.cursorTo(0)
				}

				process.stderr.write(updateSequence)

				deactivateLogScrollMode()
			} else {
				const input = String(inputBuffer)

				// Scroll event
				if (input.startsWith('\u001B\u005B\u003C\u0036')) {
					activateLogScrollMode()
				}
			}
		})
	}
}
