/* eslint-disable no-bitwise */

import TextInput from '@leondreamed/ink-text-input'
import ansiStyles from 'ansi-styles'
import chalk from 'chalk'
import type { DOMElement } from 'ink'
import { Box, measureElement, Text, useInput } from 'ink'
import { createElement, useEffect, useRef } from 'react'
import invariant from 'tiny-invariant'
import useForceUpdate from 'use-force-update'
import { subscribe } from 'valtio'
import { type IBufferCell } from 'xterm-headless'

import {
	runCommandFromCommandBox,
	selectNextCommand,
	selectPreviousCommand,
} from '~/utils/command.js'
import { localdevState, useLocaldevSnapshot } from '~/utils/store.js'
import { useTerminalSize } from '~/utils/terminal.js'

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
function getLogsBoxVirtualTerminalOutput(): string {
	const logsBoxVirtualTerminal =
		localdevState.terminalUpdater?.logsBoxVirtualTerminal
	invariant(
		logsBoxVirtualTerminal !== undefined,
		'logsBoxVirtualTerminal is not undefined'
	)
	const logsBoxHeight = localdevState.logsBoxIncludingTopLineHeight ?? 0

	// Scroll to the bottom to make sure that we're always outputting the most recently outputted lines
	logsBoxVirtualTerminal.scrollToBottom()

	const activeBuffer = logsBoxVirtualTerminal.buffer.active
	const outputLines: string[] = []
	let curCell: IBufferCell = { ...defaultCell }
	let nextCell = activeBuffer.getNullCell()

	for (
		let lineIndex = Math.max(0, activeBuffer.length - logsBoxHeight);
		lineIndex < activeBuffer.length;
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

	const output = outputLines.join('\n')
	if (outputLines.length < logsBoxHeight) {
		return '\n'.repeat(logsBoxHeight - outputLines.length) + output
	} else {
		return output
	}
}

function LocaldevLogsBox() {
	const { terminalUpdater } = useLocaldevSnapshot()

	if (terminalUpdater === null) {
		return null
	}

	return (
		<Box>
			<Text>{getLogsBoxVirtualTerminalOutput()}</Text>
		</Box>
	)
}

/**
	Note: Be careful to **not** log anything inside the component, because logs trigger state updates (since we display them in the logs box).

	Instead, write your logs inside a `useEffect` to prevent infinite re-rendering
*/
export function LocaldevUi(props: { mode: string }) {
	const logsBoxRef = useRef<DOMElement>(null)
	const terminalSize = useTerminalSize()
	const {
		logsBoxIncludingTopLineHeight,
		activeCommandBoxPaneComponent,
		hijackedServiceId,
		wrappedLogLinesToDisplay,
		commandBoxInput,
	} = useLocaldevSnapshot()
	const forceUpdate = useForceUpdate()

	useEffect(() => {
		subscribe(localdevState.wrappedLogLinesToDisplay, () => {
			// process.exit(1)
			forceUpdate()
		})
	}, [])

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
		activeCommandBoxPaneComponent,
	])

	return (
		<Box
			flexDirection="column"
			position="relative"
			height={terminalHeight}
			width={terminalWidth}
		>
			{/* We hide the title when the logs overflow so that the logs are unbroken when the user scrolls up to view overflowed logs */}
			{logsBoxIncludingTopLineHeight === null ||
				(wrappedLogLinesToDisplay.length <=
					logsBoxIncludingTopLineHeight - 1 && (
					<Box alignSelf="center" flexDirection="row">
						<Text bold>localdev</Text>
						<Text> </Text>
						<Text dimColor>[{props.mode}]</Text>
					</Box>
				))}

			<Box ref={logsBoxRef} flexGrow={1}>
				{logsBoxIncludingTopLineHeight !== null && <LocaldevLogsBox />}
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
