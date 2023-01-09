import type { FastifyInstance } from 'fastify'
import type { DOMElement, Instance } from 'ink'
import { createProxy, isChanged } from 'proxy-compare'
import { memoize } from 'proxy-memoize'
import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import useForceUpdate from 'use-force-update'
import { useSnapshot, type ref } from 'valtio'
import { proxyWithComputed, subscribeKey } from 'valtio/utils'
import { type INTERNAL_Snapshot, snapshot, subscribe } from 'valtio/vanilla'

import { type LocaldevConfig } from '~/index.js'
import { type ServiceStatus } from '~/types/service.js'
import type { TerminalUpdater } from '~/utils/terminal.js'

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
			logsBoxIncludingTopLineHeight: null as number | null,
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

	return state
}

export const localdevState = createLocaldevState()

/**
	Copied from `node_modules/valtio/esm/index.mjs` but removed the use of `useSyncExternalStore` (since it doesn't seem to work with Ink)
*/
export function useLocaldevSnapshot(): INTERNAL_Snapshot<typeof localdevState> {
	return useSnapshot(localdevState)
}
