import * as fastSort from '@leondreamed/fast-sort';
import { centerAlign } from 'ansi-center-align';
import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import mem from 'mem';
import fs from 'node:fs';
import path from 'node:path';
import splitLines from 'split-lines';
import stringLength from 'string-length';
import terminalSize from 'term-size';
import invariant from 'tiny-invariant';
import wrapAnsi from 'wrap-ansi';
import type { WrappedLogLineData } from '../types/logs.js';
import { Service } from '../utils/service.js';
import { localdevState } from '../utils/state.js';

const stderrLogColors = ['green', 'yellow', 'blue', 'magenta', 'cyan'] as const;
let stderrLogColorsIndex = 0;

export const getServicePrefixColor = mem((_serviceId: string) => {
	const stderrColor =
		stderrLogColors[stderrLogColorsIndex % stderrLogColors.length];
	stderrLogColorsIndex += 1;
	invariant(stderrColor, '`stderrColor` is not undefined');
	return stderrColor;
});

/**
	Returns an array of wrapped log lines to display on the screen based on state in localdevServerStore
*/
export async function getWrappedLogLinesDataToDisplay(): Promise<
	WrappedLogLineData[]
> {
	const serviceSpecsToLog = localdevState.serviceIdsToLog.map(
		(serviceId) => Service.get(serviceId).spec,
	);

	const wrappedLogLinesData: Array<WrappedLogLineData & { serviceId: string }> =
		[];
	for (const serviceSpec of serviceSpecsToLog) {
		const serviceName = Service.get(serviceSpec.id).name;
		// We need to get the unwrapped log lines because adding a prefix may affect the wrapping of the log line
		// eslint-disable-next-line no-await-in-loop
		const unwrappedLogLinesData = await Service.get(
			serviceSpec.id,
		).process.getUnwrappedLogLinesData();

		wrappedLogLinesData.push(
			...unwrappedLogLinesData.flatMap(({ timestamp, text, id }) => {
				const prefix = localdevState.logsBoxServiceId === null ?
					// Only add a prefix when there's multiple text
					`${chalk[getServicePrefixColor(serviceSpec.id)](serviceName)}: ` :
					undefined;

				const wrappedLogLines = wrapLine({
					prefix,
					unwrappedLine: text.trimEnd(),
				});

				return wrappedLogLines.map((text, wrappedLineIndex) => ({
					unwrappedLineId: id,
					serviceId: serviceSpec.id,
					text,
					timestamp,
					wrappedLineIndex,
				}));
			}),
		);
	}

	fastSort.inPlaceSort(wrappedLogLinesData).by([
		// Sort the logs from oldest to newest
		{ asc: (logLineData) => logLineData.timestamp },
		// We want to keep the logs from the same service ID together
		{ asc: (logLineData) => logLineData.serviceId },
		{ asc: (logLineData) => logLineData.wrappedLineIndex },
	]);

	return wrappedLogLinesData;
}

export async function activateLogScrollMode() {
	if (
		localdevState.terminalUpdater === null ||
		localdevState.logScrollModeState !== 'inactive'
	) {
		return;
	}

	try {
		localdevState.logScrollModeState = 'activating';

		// We acquire the logs mutex to prevent other code from updating the logs while we update the overflowed lines
		await localdevState.terminalUpdater.virtualLogsTerminal.writeMutex
			.acquire();

		await localdevState.terminalUpdater.updateOverflowedLines({
			beforeLineId: localdevState.terminalUpdater.virtualLogsTerminal
				.lastLogLineIdWritten ?? undefined,
		});
		localdevState.terminalUpdater.updateTerminal({ force: true });

		// We disable terminal mouse events so that the user can use the terminal's native handler for mouse and scroll events
		localdevState.terminalUpdater.disableTerminalMouseSupport();

		const { rows: terminalHeight, columns: terminalWidth } = terminalSize();
		// We output a message to the user
		process.stderr.write(
			ansiEscapes.cursorTo(1, terminalHeight - 2) +
				chalk.bgWhite.black(
					centerAlign(
						`${chalk.bold('Scroll Mode')} ${
							chalk.dim(
								'(output paused)',
							)
						} — ${chalk.italic('Press any key to resume...')}`,
						terminalWidth - 2,
					),
				),
		);
	} finally {
		localdevState.terminalUpdater.virtualLogsTerminal.writeMutex.release();

		localdevState.logScrollModeState = 'active';
	}
}

export function deactivateLogScrollMode() {
	if (localdevState.terminalUpdater === null) {
		return;
	}

	localdevState.logScrollModeState = 'inactive';

	// We re-enable terminal mouse events so that we can detect when the user scrolls (so we know to update the overflowed logs)
	localdevState.terminalUpdater.enableTerminalMouseSupport();
}

export async function clearLogs() {
	const localdevLogsDir = path.join(localdevState.localdevFolder, 'logs');

	await fs.promises.rm(localdevLogsDir, { recursive: true, force: true });
	if (localdevState.terminalUpdater === null) return;
	await localdevState.terminalUpdater.virtualLogsTerminal.clear();
	localdevState.terminalUpdater.lastUnwrappedLogLineIdRefreshed = undefined;
	localdevState.nextOverflowedWrappedLogLineIndexToOutput = 0;
}

export function wrapLine({
	unwrappedLine,
	prefix,
}: {
	unwrappedLine: string;
	prefix?: string;
}): string[] {
	const { columns: terminalWidth } = terminalSize();

	if (prefix) {
		const prefixLength = stringLength(prefix);

		return splitLines(
			wrapAnsi(unwrappedLine, terminalWidth - prefixLength, {
				hard: true,
				trim: false,
			}),
		).map((line) => prefix + line);
	} else {
		return splitLines(
			wrapAnsi(unwrappedLine, terminalWidth, { hard: true, trim: false }),
		);
	}
}
