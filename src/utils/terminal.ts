import { type Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'

import ansiEscapes from 'ansi-escapes'
import consoleClear from 'console-clear'
import { render } from 'ink'
import renderer from 'ink/build/renderer.js'
import throttle from 'just-throttle'
import patchConsole from 'patch-console'
import React, { useCallback, useEffect, useState } from 'react'
import onExit from 'signal-exit'
import terminalSize from 'term-size'
import invariant from 'tiny-invariant'
import xTermHeadless from 'xterm-headless'

import { ServiceStatusesPane } from '~/utils/command-panes/service-statuses.jsx'
import {
	activateLogScrollMode,
	deactivateLogScrollMode,
	getWrappedLogLinesToDisplay,
} from '~/utils/logs.js'
import { markRaw } from '~/utils/raw.js'
import { Service } from '~/utils/service.js'
import { MockStdin } from '~/utils/stdin.js'
import { localdevStore } from '~/utils/store.js'
import { LocaldevUi } from '~/utils/ui.jsx'

const { Terminal } = xTermHeadless

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

const SYNC_START = '\u001B[?2026h'
const SYNC_END = '\u001B[?2026l'

export class TerminalUpdater {
	previousOutput = ''
	hasPressAnyKeyToContinueNoticeBeenWritten = false
	updateIntervalId: NodeJS.Timer | undefined
	mode: string
	inkStdin = new MockStdin()
	virtualTerminal = new Terminal({
		rows: terminalSize().rows,
		cols: terminalSize().columns,
		// Enable experimental options
		allowProposedApi: true,
	})

	constructor({ mode }: { mode: 'development' | 'test' }) {
		this.mode = mode
	}

	write(data: string | Buffer) {
		// Note: we don't currently do anything with the virtual terminal, but in the future it would be optimal to
		// display the virtual terminal's buffer in the log box for programs like `start-docker` which use ansi-escape
		// codes to manipulate the cursor and display dynamically-updating output
		// this.virtualTerminal.write(data)
		// const virtualTerminalLines: string[] = []
		// for (
		// 	let lineIndex = 0;
		// 	lineIndex < this.virtualTerminal.buffer.active.length;
		// 	lineIndex += 1
		// ) {
		// 	const line = this.virtualTerminal.buffer.active.getLine(lineIndex)
		// 	invariant(line !== undefined, 'line should not be undefined')
		// 	virtualTerminalLines.push(line.translateToString())
		// }

		process.stderr.write(data)
	}

	/**
		Tell the terminal to capture mouse events.
		@see https://github.com/Textualize/textual/blob/main/src/textual/drivers/linux_driver.py#L65
	*/
	enableTerminalMouseSupport() {
		this.write('\u001B[?1000h') // SET_VT200_MOUSE
		this.write('\u001B[?1003h') // SET_ANY_EVENT_MOUSE
		this.write('\u001B[?1015h') // SET_VT200_HIGHLIGHT_MOUSE
		this.write('\u001B[?1006h') // SET_SGR_EXT_MODE_MOUSE
	}

	/**
		Make the terminal no longer capture mouse events.
	*/
	disableTerminalMouseSupport() {
		this.write('\u001B[?1000l')
		this.write('\u001B[?1003l')
		this.write('\u001B[?1015l')
		this.write('\u001B[?1006l')
	}

	start() {
		const termSize = terminalSize()

		// Initially, we want to display the status of the services
		localdevStore.activeCommandBoxPaneComponent = markRaw(
			ServiceStatusesPane as any
		)
		localdevStore.inkInstance = markRaw(
			render(React.createElement(LocaldevUi, { mode: this.mode }), {
				// We pass in a "noop stream" to Ink's `stdout` because we use our own rendering function for Ink (the built-in rendering function for Ink has flickering issues)
				// @ts-expect-error: not a perfect type match but works at runtime
				stdout: new PassThrough(),

				// We use a mock `process.stdin` so that we can control the input that ink processes. In particular, when log scroll mode is active, we want to make sure that ink doesn't process the key that's pressed to exit log scroll mode.
				stdin: this.inkStdin,

				// We handle Ctrl+C manually
				exitOnCtrlC: false,

				// We use our own console patches.
				patchConsole: false,
			}) as any
		)

		patchConsole((_stream, data) => {
			const localdevLogs = Service.get('$localdev')
			localdevLogs.process.addLogs(data.trimEnd())
		})

		this.write(ansiEscapes.cursorHide)
		const lines = '\n'.repeat(termSize.rows)

		// Since we're overwriting line-by-line, we want to initially make all lines a newline character
		this.write(lines)
		this.previousOutput = lines

		// A delay of 10ms incurs significant CPU usage for a mostly unnoticeable difference in refresh rate, so we use a delay of 50ms instead (which should give a refresh rate of 20 fps)
		this.updateIntervalId = setInterval(this.updateTerminal.bind(this), 50)

		this.enableTerminalMouseSupport()
		onExit(() => {
			this.disableTerminalMouseSupport()
		})

		this.#registerStdinListener()
		this.#setTerminalResizeListeners()
		this.updateTerminal()
	}

	updateTerminal(options?: {
		updateOverflowedLines?: boolean
		force?: boolean
	}) {
		if (localdevStore.inkInstance === null) {
			return
		}

		if (!localdevStore.logScrollModeState.active) {
			this.enableTerminalMouseSupport()
		}

		// We still want to re-render the terminal if it gets resized while `logScrollModeState` is active
		if (!options?.force && localdevStore.logScrollModeState.active) {
			return
		}

		if (localdevStore.inkInstance.isUnmounted) {
			clearInterval(this.updateIntervalId)
			return
		}

		// If we want to force an update, we pretend that the previous output was empty
		if (
			(options?.force ?? false) ||
			// Updating overflowed lines implicitly implies a forced update
			options?.updateOverflowedLines
		) {
			this.previousOutput = ''
		}

		/**
			The string we want to write to the terminal to update the screen.
		*/
		let updateSequence = ansiEscapes.cursorHide

		// If there are overflowed lines that need to be logged, then output them first
		if (options?.updateOverflowedLines) {
			updateSequence += this.#getUpdateSequenceFromUpdatingOverflowedLines()
		}

		const { columns: terminalWidth, rows: terminalHeight } = terminalSize()
		const newOutput = renderer.default(
			localdevStore.inkInstance.rootNode,
			terminalWidth
		).output

		if (newOutput === this.previousOutput) {
			return
		}

		const newLines = newOutput.split('\n')

		const previousLines =
			this.previousOutput === '' ? [] : this.previousOutput.split('\n')

		// To refresh the terminal display, we start at the top-left corner of the screen (this assumes that our output is full screen, which it is)
		updateSequence += ansiEscapes.cursorTo(0, 0)

		for (let row = 0; row < terminalHeight; row += 1) {
			const previousLine = previousLines[row]
			const newLine = newLines[row]

			// If the line from the previous render is equal to the line in the current render
			if (
				previousLines.length === newLines.length &&
				previousLine === newLine
			) {
				// Don't erase the line; keep it on the screen
			} else {
				// Erase the line and replace it
				updateSequence += ansiEscapes.eraseLine + (newLine ?? '')
			}

			updateSequence += ansiEscapes.cursorDown() + ansiEscapes.cursorTo(0)
		}

		this.write(SYNC_START + updateSequence + SYNC_END)
		this.previousOutput = newOutput
	}

	#setTerminalResizeListeners() {
		/**
			When the terminal is resized, we recalculate the wrapped log lines to display.
		*/
		onTerminalResize(
			throttle(
				() => {
					// We wait until the next tick to allow all non-forced terminal updates to run first (this fixes the problem of rendering over "ghost" values of `previousOutputs`)
					setTimeout(() => {
						// When the terminal resizes, all the overflowed wrapped lines become unaligned, so we reset these variables
						localdevStore.nextOverflowedWrappedLogLineIndexToOutput = 0
						localdevStore.wrappedLogLinesToDisplay =
							getWrappedLogLinesToDisplay()

						// We need to hard clear the console in order to preserve the continuity of overflowed logs as the terminal resize causes some lines to overflow
						consoleClear(/* isSoft */ false)

						this.updateTerminal({ force: true, updateOverflowedLines: true })
					}, 0)
				},
				200,
				{ trailing: true }
			)
		)
	}

	#getUpdateSequenceFromUpdatingOverflowedLines(): string {
		let updateSequence = ''
		// Don't log overflowed lines if the UI hasn't rendered yet
		if (localdevStore.logsBoxIncludingTopLineHeight === null) return ''

		// The terminal can only display the last `logsBoxIncludingTopLineHeight` log lines, so the
		// lines until that are overflowed lines
		const overflowedWrappedLogLines =
			localdevStore.wrappedLogLinesToDisplay.slice(
				0,
				localdevStore.wrappedLogLinesToDisplay.length -
					localdevStore.logsBoxIncludingTopLineHeight
			)

		if (overflowedWrappedLogLines.length === 0) return ''

		const { rows: numTerminalRows } = terminalSize()
		let overflowedWrappedLogLineIndex =
			localdevStore.nextOverflowedWrappedLogLineIndexToOutput

		const numOverflowedWrappedLogLinesToOutput =
			overflowedWrappedLogLines.length -
			localdevStore.nextOverflowedWrappedLogLineIndexToOutput

		if (numOverflowedWrappedLogLinesToOutput <= 0) {
			return ''
		}

		// Move the cursor to the top-left corner
		updateSequence += ansiEscapes.cursorTo(0, 0)

		// Overwrite as many top lines with overflowed log lines as possible
		for (
			;
			overflowedWrappedLogLineIndex <
			Math.min(
				localdevStore.nextOverflowedWrappedLogLineIndexToOutput +
					numTerminalRows,
				overflowedWrappedLogLines.length
			);
			overflowedWrappedLogLineIndex += 1
		) {
			const overflowedWrappedLogLine =
				overflowedWrappedLogLines[overflowedWrappedLogLineIndex]
			invariant(
				overflowedWrappedLogLine !== undefined,
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

		localdevStore.nextOverflowedWrappedLogLineIndexToOutput =
			overflowedWrappedLogLines.length

		return updateSequence
	}

	#registerStdinListener() {
		process.stdin.setRawMode(true)
		process.stdin.on('data', (inputBuffer) => {
			const { logScrollModeState } = localdevStore

			if (logScrollModeState.active) {
				// Re-rendering the previous output onto the terminal
				const previousLines = this.previousOutput.split('\n')
				let updateSequence =
					ansiEscapes.cursorUp(previousLines.length) + ansiEscapes.cursorLeft
				for (const line of previousLines) {
					updateSequence += ansiEscapes.eraseLine + line
					updateSequence += ansiEscapes.cursorDown() + ansiEscapes.cursorTo(0)
				}

				this.write(updateSequence)

				deactivateLogScrollMode()
			} else {
				const input = String(inputBuffer)
				// ANSI escape sequences for scroll events (based on experimentation)
				const isScrollEvent = input.startsWith('\u001B\u005B\u003C\u0036')
				if (isScrollEvent) {
					activateLogScrollMode()
				}

				this.inkStdin.send(inputBuffer)
			}
		})
	}
}
