/* eslint-disable no-bitwise */

import { type Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import { centerAlign } from 'ansi-center-align'
import ansiEscapes from 'ansi-escapes'
import ansiStyles from 'ansi-styles'
import chalk from 'chalk'
import consoleClear from 'console-clear'
import { render } from 'ink'
import renderer from 'ink/build/renderer.js'
import { jsonl } from 'js-jsonl'
import { OrderedSet } from 'js-sdsl'
import debounce from 'just-debounce-it'
import throttle from 'just-throttle'
import patchConsole from 'patch-console'
import React, { useCallback, useEffect, useState } from 'react'
import onExit from 'signal-exit'
import terminalSize from 'term-size'
import invariant from 'tiny-invariant'
import { ref } from 'valtio'
import xTermHeadless, { type IBufferCell } from 'xterm-headless'

import { ServiceStatusesPane } from '~/utils/command-panes/service-statuses.js'
import {
	activateLogScrollMode,
	deactivateLogScrollMode,
	getServicePrefixColor,
	getWrappedLogLinesToDisplay,
	wrapLine,
} from '~/utils/logs.js'
import { Service } from '~/utils/service.js'
import { localdevState } from '~/utils/state.js'
import { MockStdin } from '~/utils/stdin.js'
import { LocaldevUi } from '~/utils/ui.js'

// xterm-headless is a CommonJS module
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
	inkStdin = new MockStdin()
	logsBoxVirtualTerminal = new Terminal({
		rows: terminalSize().rows,
		cols: terminalSize().columns,
		// Enable experimental options
		allowProposedApi: true,
	})

	write(data: string | Buffer) {
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
		localdevState.activeCommandBoxPaneComponent = ref(
			ServiceStatusesPane as any
		)
		localdevState.inkInstance = ref(
			render(React.createElement(LocaldevUi), {
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
			void localdevLogs.process.addUnwrappedLogLine(data.trimEnd())
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

	async updateOverflowedLines() {
		const updateSequence =
			await this.#getUpdateSequenceFromUpdatingOverflowedLines()
		this.write(SYNC_START + updateSequence + SYNC_END)
	}

	async refreshLogs() {
		if (localdevState.terminalUpdater === null) return

		const wrappedLogLinesToDisplay = await getWrappedLogLinesToDisplay()

		localdevState.terminalUpdater.logsBoxVirtualTerminal.write(
			ansiEscapes.clearTerminal
		)
		for (const line of wrappedLogLinesToDisplay) {
			localdevState.terminalUpdater.logsBoxVirtualTerminal.writeln(line)
		}

		localdevState.logsBoxVirtualTerminalOutput =
			getLogsBoxVirtualTerminalOutput()
	}

	updateTerminal(options?: {
		updateOverflowedLines?: boolean
		force?: boolean
	}) {
		const force = options?.force ?? false

		if (localdevState.inkInstance === null) {
			return
		}

		if (!localdevState.logScrollModeState.active) {
			this.enableTerminalMouseSupport()
		}

		// We still want to re-render the terminal if it gets resized while `logScrollModeState` is active
		if (!force && localdevState.logScrollModeState.active) {
			return
		}

		if (localdevState.inkInstance.isUnmounted) {
			clearInterval(this.updateIntervalId)
			return
		}

		// If we want to force an update, we pretend that the previous output was empty
		if (
			force ||
			// Updating overflowed lines implicitly implies a forced update
			options?.updateOverflowedLines
		) {
			this.previousOutput = ''
		}

		/**
			The string we want to write to the terminal to update the screen.
		*/
		let updateSequence = ansiEscapes.cursorHide

		const { columns: terminalWidth, rows: terminalHeight } = terminalSize()
		const newOutput = renderer.default(
			localdevState.inkInstance.rootNode,
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
		this.logsBoxVirtualTerminal.onResize(() => {
			// TODO: figure out why I need to delay this by a non-zero amount
			setTimeout(() => {
				localdevState.logsBoxVirtualTerminalOutput =
					getLogsBoxVirtualTerminalOutput()
			}, 50)
		})

		/**
			When the terminal is resized, we recalculate the wrapped log lines to display.
		*/
		onTerminalResize(
			throttle(
				() => {
					// We wait until the next tick to allow all non-forced terminal updates to run first (this fixes the problem of rendering over "ghost" values of `previousOutput` values)
					setTimeout(async () => {
						if (
							localdevState.terminalUpdater === null ||
							localdevState.logsBoxHeight === null
						) {
							return
						}

						resizeVirtualTerminal(
							terminalSize().columns,
							localdevState.logsBoxHeight
						)
						// When the terminal resizes, all the overflowed wrapped lines become unaligned, so we reset these variables
						localdevState.nextOverflowedWrappedLogLineIndexToOutput = 0
						await localdevState.terminalUpdater.refreshLogs()

						// We need to hard clear the console in order to preserve the continuity of overflowed logs as the terminal resize causes some lines to overflow
						consoleClear(/* isSoft */ false)

						await this.updateOverflowedLines()
						this.updateTerminal({ force: true })
					}, 0)
				},
				200,
				{ trailing: true }
			)
		)
	}

	/**
		This function is called to output the overflowed lines into the current terminal scrollback buffer.
		This is only called when the user enters "Scroll Mode" or exits the program.
	*/
	async #getUpdateSequenceFromUpdatingOverflowedLines(): Promise<string> {
		let updateSequence = ''

		// Don't log overflowed lines if the UI hasn't rendered yet
		if (localdevState.logsBoxHeight === null) return ''

		// We recreate the wrapped log lines to display
		const wrappedLogLinesToDisplay = new OrderedSet<{
			wrappedLineIndex: number
			timestamp: number
			wrappedLine: string
		}>([], (l1, l2) => {
			if (l1.timestamp === l2.timestamp) {
				return l1.wrappedLineIndex - l2.wrappedLineIndex
			} else {
				return l1.timestamp - l2.timestamp
			}
		})

		await Promise.all(
			localdevState.serviceIdsToLog.map(async (serviceId) => {
				const service = Service.get(serviceId)
				const unwrappedServiceLogLinesData =
					await service.process.getUnwrappedLogLinesData()

				for (const {
					timestamp,
					unwrappedLine,
				} of unwrappedServiceLogLinesData) {
					const prefix =
						localdevState.logsBoxServiceId === null
							? // Only add a prefix when there's multiple text
							  `${chalk[getServicePrefixColor(serviceId)](
									Service.get(serviceId).name
							  )}: `
							: undefined
					for (const [wrappedLineIndex, wrappedLine] of wrapLine({
						prefix,
						unwrappedLine,
					}).entries()) {
						wrappedLogLinesToDisplay.insert({
							timestamp,
							wrappedLine,
							wrappedLineIndex,
						})
					}
				}
			})
		)

		// The terminal can only display the last `logsBoxHeight` log lines, so the
		// lines until that are overflowed lines
		const overflowedWrappedLogLines = [...wrappedLogLinesToDisplay]
			.slice(0, wrappedLogLinesToDisplay.length - localdevState.logsBoxHeight)
			.map((l) => l.wrappedLine)

		if (overflowedWrappedLogLines.length === 0) return ''

		const { rows: numTerminalRows } = terminalSize()
		let overflowedWrappedLogLineIndex =
			localdevState.nextOverflowedWrappedLogLineIndexToOutput

		const numOverflowedWrappedLogLinesToOutput =
			overflowedWrappedLogLines.length -
			localdevState.nextOverflowedWrappedLogLineIndexToOutput

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
				localdevState.nextOverflowedWrappedLogLineIndexToOutput +
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

		localdevState.nextOverflowedWrappedLogLineIndexToOutput =
			overflowedWrappedLogLines.length

		return updateSequence
	}

	#registerStdinListener() {
		process.stdin.setRawMode(true)
		process.stdin.on('data', (inputBuffer) => {
			const { logScrollModeState } = localdevState

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

function getFgColorAnsiSequenceFromCell(cell: IBufferCell) {
	if (cell.isFgDefault()) {
		return ansiStyles.color.close
	} else if (cell.isFgPalette()) {
		return ansiStyles.color.ansi256(cell.getFgColor())
	} else {
		const hex = cell.getFgColor()
		const r = (hex >> 16) & 255
		const g = (hex >> 8) & 255
		const b = hex & 255
		return ansiStyles.color.ansi16m(r, g, b)
	}
}

function getBgColorAnsiSequenceFromCell(cell: IBufferCell) {
	if (cell.isBgDefault()) {
		return ansiStyles.bgColor.close
	} else if (cell.isBgPalette()) {
		return ansiStyles.bgColor.ansi256(cell.getBgColor())
	} else {
		const hex = cell.getBgColor()
		const r = (hex >> 16) & 255
		const g = (hex >> 8) & 255
		const b = hex & 255
		return ansiStyles.bgColor.ansi16m(r, g, b)
	}
}

function getAnsiUpdateSequenceForCellUpdate(
	curCell: IBufferCell,
	nextCell: IBufferCell
): string {
	let updateSequence = ''

	// Bold
	if (curCell.isBold() && !nextCell.isBold()) {
		updateSequence += ansiStyles.bold.close
	} else if (!curCell.isBold() && nextCell.isBold()) {
		updateSequence += ansiStyles.bold.open
	}

	// Italic
	if (curCell.isItalic() && !nextCell.isItalic()) {
		updateSequence += ansiStyles.italic.close
	} else if (!curCell.isItalic() && nextCell.isItalic()) {
		updateSequence += ansiStyles.italic.open
	}

	// Underline
	if (curCell.isUnderline() && !nextCell.isUnderline()) {
		updateSequence += ansiStyles.underline.close
	} else if (!curCell.isUnderline() && nextCell.isUnderline()) {
		updateSequence += ansiStyles.underline.open
	}

	// Strikethrough
	if (curCell.isStrikethrough() && !nextCell.isStrikethrough()) {
		updateSequence += ansiStyles.strikethrough.close
	} else if (!curCell.isStrikethrough() && nextCell.isStrikethrough()) {
		updateSequence += ansiStyles.strikethrough.open
	}

	// Inverse
	if (curCell.isInverse() && !nextCell.isInverse()) {
		updateSequence += ansiStyles.inverse.close
	} else if (!curCell.isInverse() && nextCell.isInverse()) {
		updateSequence += ansiStyles.inverse.open
	}

	// Dim
	if (curCell.isDim() && !nextCell.isDim()) {
		updateSequence += ansiStyles.dim.close
	} else if (!curCell.isDim() && nextCell.isDim()) {
		updateSequence += ansiStyles.dim.open
	}

	// Hidden
	if (curCell.isInvisible() && !nextCell.isInvisible()) {
		updateSequence += ansiStyles.hidden.close
	} else if (!curCell.isInvisible() && nextCell.isInvisible()) {
		updateSequence += ansiStyles.hidden.open
	}

	let isSameFgColor = true
	if (curCell.getFgColorMode() !== nextCell.getFgColorMode()) {
		isSameFgColor = false
	} else if (curCell.getFgColor() !== nextCell.getFgColor()) {
		isSameFgColor = false
	}

	if (!isSameFgColor) {
		updateSequence +=
			ansiStyles.color.close + getFgColorAnsiSequenceFromCell(nextCell)
	}

	let isSameBgColor = true
	if (curCell.getBgColorMode() !== nextCell.getBgColorMode()) {
		isSameBgColor = false
	} else if (curCell.getBgColor() !== nextCell.getBgColor()) {
		isSameBgColor = false
	}

	if (!isSameBgColor) {
		updateSequence +=
			ansiStyles.bgColor.close + getBgColorAnsiSequenceFromCell(nextCell)
	}

	updateSequence += nextCell.getChars()

	return updateSequence
}

const defaultCell: IBufferCell = {
	getBgColor: () => 0,
	getBgColorMode: () => 0,
	isBgPalette: () => false,
	isBgRGB: () => false,
	isBgDefault: () => true,
	getFgColor: () => 0,
	getFgColorMode: () => 0,
	isFgPalette: () => false,
	isFgRGB: () => false,
	isFgDefault: () => true,
	isBold: () => 0,
	isItalic: () => 0,
	isUnderline: () => 0,
	isBlink: () => 0,
	isDim: () => 0,
	isStrikethrough: () => 0,
	isInverse: () => 0,
	isInvisible: () => 0,
	isAttributeDefault: () => true,
	getChars: () => '',
	getCode: () => 0,
	getWidth: () => 1,
}

/**
	Loops over the virtual terminal and returns the output (including ANSI sequences)
*/
export function getLogsBoxVirtualTerminalOutput(): string {
	if (
		localdevState.logsBoxHeight === null ||
		localdevState.terminalUpdater === null
	) {
		return ''
	}

	const { logsBoxVirtualTerminal } = localdevState.terminalUpdater
	const { logsBoxHeight } = localdevState

	const activeBuffer = logsBoxVirtualTerminal.buffer.active
	const outputLines: string[] = []
	let curCell: IBufferCell = { ...defaultCell }
	let nextCell = activeBuffer.getNullCell()

	// Count the number of lines from the bottom which have not been outputted to
	let linesFromBottomWithNoOutput: number

	// If the viewport is zero, it means that there aren't enough log lines to span the entire terminal
	if (activeBuffer.viewportY === 0) {
		linesFromBottomWithNoOutput = 0

		for (
			let lineIndex = activeBuffer.length - 1;
			lineIndex > 0;
			lineIndex -= 1
		) {
			const length = activeBuffer
				.getLine(lineIndex)
				?.translateToString()
				.trim().length

			if (length !== undefined && length !== 0) {
				break
			}

			linesFromBottomWithNoOutput += 1
		}
	} else {
		linesFromBottomWithNoOutput = 0
	}

	for (
		let lineIndex = Math.max(0, activeBuffer.length - logsBoxHeight);
		lineIndex < activeBuffer.length - linesFromBottomWithNoOutput;
		lineIndex += 1
	) {
		let currentOutputLine = ''
		const bufferLine = activeBuffer.getLine(lineIndex)!
		for (let col = 0; col < bufferLine.length; col += 1) {
			nextCell = bufferLine.getCell(col)!
			currentOutputLine += getAnsiUpdateSequenceForCellUpdate(curCell, nextCell)
			curCell = nextCell
		}

		outputLines.push(currentOutputLine)
	}

	let output: string
	if (linesFromBottomWithNoOutput > 0) {
		const titleLine = centerAlign(
			chalk.underline.bold('localdev'),
			terminalSize().columns
		)
		output =
			titleLine +
			'\n'.repeat(linesFromBottomWithNoOutput) +
			outputLines.join('\n')
	} else {
		output = outputLines.join('\n')
	}

	return output
}

export const resizeVirtualTerminal = debounce(
	(columns: number, rows: number) => {
		if (localdevState.terminalUpdater === null) return
		localdevState.terminalUpdater.logsBoxVirtualTerminal.resize(columns, rows)
	},
	50,
	true
)
