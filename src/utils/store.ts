import ansiEscapes from 'ansi-escapes'
import type { FastifyInstance } from 'fastify'
import type { DOMElement, Instance } from 'ink'
import { memoize } from 'proxy-memoize'
import type React from 'react'
import terminalSize from 'term-size'
import { type ref, useSnapshot } from 'valtio'
import { proxyWithComputed, subscribeKey } from 'valtio/utils'
import { type INTERNAL_Snapshot, subscribe } from 'valtio/vanilla'

import { type LocaldevConfig } from '~/index.js'
import { type ServiceStatus } from '~/types/service.js'
import {
	type TerminalUpdater,
	getLogsBoxVirtualTerminalOutput,
} from '~/utils/terminal.js'

// eslint-disable-next-line @typescript-eslint/ban-types -- object is used in the original type
type Ref<T extends object> = ReturnType<typeof ref<T>>

function createLocaldevState() {
	const state = proxyWithComputed(
		{
			app: null as Ref<FastifyInstance> | null,
			localdevConfig: null! as LocaldevConfig,
			activeHelpCommand: null as string | null,
			servicesEnabled: true,
			activeCommandBoxPaneComponent: null as Ref<React.FC> | null,
			nextOverflowedWrappedLogLineIndexToOutput: 0,
			logsBoxHeight: null as number | null,
			/**
				The ID of the service whose logs are displayed in the logs box. `null` represents the default services specified in `localdev.config.cjs`.
			*/
			logsBoxServiceId: null as string | null,
			/**
				The ID of the service that's currently hijacked (`null` means no service is currently being hijacked)
			*/
			hijackedServiceId: null as string | null,
			/**
				The current input inside the command box
			*/
			commandBoxInput: '',

			/**
				A history of the commands that were run
			*/
			commandHistory: [] as string[],

			/**
				The current command history index (changed by pressing the up/down arrow inside the command box). A value equal to the length of `commandHistory` indicate that no past command is selected.
			*/
			currentCommandHistoryIndex: 0,
			logScrollModeState: {
				active: false,
			} as { active: true; wrappedLogLinesLength: number } | { active: false },
			inkInstance: null as Ref<
				Instance & {
					isUnmounted: boolean
					rootNode: DOMElement
				}
			> | null,
			terminalUpdater: null as Ref<TerminalUpdater> | null,

			/**
				An array containing the all the log lines that should be displayed, including overflowed lines.
				Note: `wrappedLogLinesToDisplay` is a mutable string array and not a computed property because we want to be able to
				incrementally update it instead of always re-computing it.
			*/
			wrappedLogLinesToDisplay: [] as string[],

			serviceStatuses: {} as Record<string, ServiceStatus>,

			// We make the output of the logs box virtual terminal part of the state so that we can control rendering order: we always want Ink to display whatever is in this variable at all times on the screen
			logsBoxVirtualTerminalOutput: '',
		},
		{
			serviceIdsToLog: memoize((snap) => {
				if (!snap.servicesEnabled) {
					return []
				}

				const serviceIds: string[] = []
				if (snap.logsBoxServiceId === null) {
					serviceIds.push(
						...Object.keys(snap.localdevConfig.servicesToLog ?? {})
					)
				} else {
					serviceIds.push(snap.logsBoxServiceId)
				}

				if (
					snap.localdevConfig.logServerEvents &&
					// Don't log $localdev events when streaming the logs of a specific service
					snap.logsBoxServiceId === null
				) {
					serviceIds.push('$localdev')
				}

				return serviceIds
			}),
		}
	)

	// Whenever the logs box height changes, we want to update the overflowed lines since their positions will have changed
	subscribeKey(state, 'activeCommandBoxPaneComponent', () => {
		if (state.terminalUpdater !== null) {
			state.terminalUpdater.updateTerminal({
				force: true,
				updateOverflowedLines: true,
			})
		}
	})

	// Whenever the `wrappedLogLinesToDisplay` array changes, we should update the logs box virtual terminal
	subscribe(state.wrappedLogLinesToDisplay, () => {
		if (state.terminalUpdater === null) return
		state.terminalUpdater.logsBoxVirtualTerminal.write(
			ansiEscapes.clearTerminal
		)
		for (const line of state.wrappedLogLinesToDisplay) {
			state.terminalUpdater.logsBoxVirtualTerminal.writeln(line)
		}

		state.logsBoxVirtualTerminalOutput = getLogsBoxVirtualTerminalOutput()
	})

	subscribeKey(state, 'logsBoxHeight', (newHeight) => {
		if (state.terminalUpdater === null || newHeight === null) return
		state.terminalUpdater.logsBoxVirtualTerminal.write(
			ansiEscapes.clearTerminal
		)
		state.terminalUpdater.logsBoxVirtualTerminal.resize(
			terminalSize().columns,
			newHeight
		)
		state.logsBoxVirtualTerminalOutput = getLogsBoxVirtualTerminalOutput()
	})

	return state
}

export const localdevState = createLocaldevState()

/**
	Copied from `node_modules/valtio/esm/index.mjs` but removed the use of `useSyncExternalStore` (since it doesn't seem to work with Ink)
	TODO (since I don't want to fork valtio when publishing to npm)
*/
export function useLocaldevSnapshot(): INTERNAL_Snapshot<typeof localdevState> {
	return useSnapshot(localdevState)
}
