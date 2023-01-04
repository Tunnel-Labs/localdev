import * as fastSort from '@leondreamed/fast-sort'
import { centerAlign } from 'ansi-center-align'
import ansiEscapes from 'ansi-escapes'
import chalk from 'chalk'
import mem from 'mem'
import splitLines from 'split-lines'
import stringLength from 'string-length'
import terminalSize from 'term-size'
import invariant from 'tiny-invariant'
import wrapAnsi from 'wrap-ansi'

import type { WrappedLogLineData } from '~/types/logs.js'
import { Service } from '~/utils/service.js'
import { localdevState } from '~/utils/store.js'
import { getWrappedText } from '~/utils/text.js'

const stderrLogColors = ['green', 'yellow', 'blue', 'magenta', 'cyan'] as const
let stderrLogColorsIndex = 0

export const getServicePrefixColor = mem((_serviceId: string) => {
	const stderrColor =
		stderrLogColors[stderrLogColorsIndex % stderrLogColors.length]
	stderrLogColorsIndex += 1
	invariant(stderrColor, '`stderrColor` is not undefined')
	return stderrColor
})

/**
	Returns an array of wrapped log lines to display on the screen based on state in localdevServerStore
*/
export function getWrappedLogLinesToDisplay(): string[] {
	const serviceSpecsToLog = localdevState.serviceIdsToLog.map(
		(serviceId) => Service.get(serviceId).spec
	)

	const wrappedLogLinesData: Array<WrappedLogLineData & { serviceId: string }> =
		[]
	for (const serviceSpec of serviceSpecsToLog) {
		const serviceName = Service.get(serviceSpec.id).name
		// We need to get the unwrapped log lines because adding a prefix may affect the wrapping of the log line
		const unwrappedLogLines = Service.get(
			serviceSpec.id
		).process.getUnwrappedLogLines({
			withTimestamps: true,
		})
		wrappedLogLinesData.push(
			...unwrappedLogLines.flatMap((unwrappedLogLine) => {
				const logLineText: string =
					localdevState.logsBoxServiceId === null
						? // Only add a prefix when there's multiple text
						  `${chalk[getServicePrefixColor(serviceSpec.id)](serviceName)}: ${
								unwrappedLogLine.text
						  }`
						: unwrappedLogLine.text

				const wrappedLogLineText = getWrappedText(logLineText)

				return wrappedLogLineText.map((text, wrappedLineIndex) => ({
					serviceId: serviceSpec.id,
					text,
					timestamp: unwrappedLogLine.timestamp,
					wrappedLineIndex,
				}))
			})
		)
	}

	fastSort.inPlaceSort(wrappedLogLinesData).by([
		// Sort the logs from oldest to newest
		{ asc: (logLineData) => logLineData.timestamp },
		// We want to keep the logs from the same service ID together
		{ asc: (logLineData) => logLineData.serviceId },
		{ asc: (logLineData) => logLineData.wrappedLineIndex },
	])

	return wrappedLogLinesData.map((logLineData) => logLineData.text)
}

export function activateLogScrollMode() {
	if (localdevState.terminalUpdater === null) {
		return
	}

	localdevState.terminalUpdater.updateTerminal({ updateOverflowedLines: true })

	// We pause further updates by setting `logScrollModeState.active` to true
	localdevState.logScrollModeState = {
		active: true,
		wrappedLogLinesLength: localdevState.wrappedLogLinesToDisplay.length,
	}

	const { rows: terminalHeight, columns: terminalWidth } = terminalSize()
	// We output a message to the user
	process.stderr.write(
		ansiEscapes.cursorTo(1, terminalHeight - 2) +
			chalk.bgWhite.black(
				centerAlign(
					`${chalk.bold('Scroll Mode')} ${chalk.dim(
						'(output paused)'
					)} — ${chalk.italic('Press any key to resume...')}`,
					terminalWidth - 2
				)
			)
	)

	// We disable terminal mouse events so that the user can use the terminal's native handler for mouse and scroll events
	localdevState.terminalUpdater.disableTerminalMouseSupport()
}

export function deactivateLogScrollMode() {
	if (localdevState.terminalUpdater === null) {
		return
	}

	localdevState.logScrollModeState = { active: false }

	// We re-enable terminal mouse events so that we can detect when the user scrolls (so we know to update the overflowed logs)
	localdevState.terminalUpdater.enableTerminalMouseSupport()
}

export function clearLogs() {
	localdevState.wrappedLogLinesToDisplay = []
}

export function wrapLineWithPrefix({
	unwrappedLine,
	prefix,
}: {
	unwrappedLine: string
	prefix: string
}) {
	const { columns: terminalWidth } = terminalSize()
	const prefixLength = stringLength(prefix)

	const wrappedLines = splitLines(
		(wrapAnsi as unknown as typeof wrapAnsi['default'])(
			unwrappedLine,
			terminalWidth - prefixLength,
			{
				hard: true,
				trim: false,
			}
		)
	).map((line) => prefix + line)

	return wrappedLines
}
