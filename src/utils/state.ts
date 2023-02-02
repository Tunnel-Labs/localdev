import ansiEscapes from 'ansi-escapes'
import type { FastifyInstance } from 'fastify'
import type { DOMElement, Instance } from 'ink'
import { createProxy, isChanged } from 'proxy-compare'
import { memoize } from 'proxy-memoize'
import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import terminalSize from 'term-size'
import useForceUpdate from 'use-force-update'
import type { ref } from 'valtio'
import { proxyWithComputed, subscribeKey } from 'valtio/utils'
import { type INTERNAL_Snapshot, snapshot, subscribe } from 'valtio/vanilla'

import { type LocaldevConfig } from '~/index.js'
import { type ServiceStatus } from '~/types/service.js'
import {
	type TerminalUpdater,
	resizeVirtualTerminal,
} from '~/utils/terminal.js'

// eslint-disable-next-line @typescript-eslint/ban-types -- object is used in the original type
type Ref<T extends object> = ReturnType<typeof ref<T>>

function createLocaldevState() {
	const state = proxyWithComputed(
		{
			app: null as Ref<FastifyInstance> | null,
			projectPath: null! as string,
			localdevConfigPath: null! as string,
			localdevLocalConfigPath: undefined as string | undefined,
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
			} as { active: boolean },
			inkInstance: null as Ref<
				Instance & {
					isUnmounted: boolean
					rootNode: DOMElement
				}
			> | null,
			terminalUpdater: null as Ref<TerminalUpdater> | null,

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
	subscribeKey(state, 'activeCommandBoxPaneComponent', async () => {
		if (state.terminalUpdater !== null) {
			state.nextOverflowedWrappedLogLineIndexToOutput = 0
			state.terminalUpdater.updateTerminal({
				force: true,
			})
		}
	})

	subscribeKey(state, 'logsBoxHeight', async (newHeight) => {
		if (state.terminalUpdater === null || newHeight === null) return

		resizeVirtualTerminal(terminalSize().columns, newHeight)
		await state.terminalUpdater.refreshLogs()
	})

	return state
}

export const localdevState = createLocaldevState()

/**
	Copied from `node_modules/valtio/esm/index.mjs` but removed the use of `useSyncExternalStore` (since it doesn't work with Ink, see https://github.com/pmndrs/valtio/discussions/623)
*/
export function useLocaldevSnapshot(): INTERNAL_Snapshot<typeof localdevState> {
	const currSnapshot = useRef(snapshot(localdevState))
	const lastSnapshot = useRef<any>()
	const lastAffected = useRef<any>()
	const forceUpdate = useForceUpdate()

	useEffect(() => {
		const callback = () => {
			const nextSnapshot = snapshot(localdevState)
			try {
				if (
					lastSnapshot.current &&
					lastAffected.current &&
					!isChanged(
						lastSnapshot.current,
						nextSnapshot,
						lastAffected.current,
						/* @__PURE__ */ new WeakMap()
					)
				) {
					return lastSnapshot.current
				}
			} catch {}

			lastSnapshot.current = currSnapshot.current
			currSnapshot.current = nextSnapshot
			forceUpdate()
		}

		const unsubscribe = subscribe(localdevState, callback)
		callback()
		return unsubscribe
	}, [])

	const currAffected = /* @__PURE__ */ new WeakMap()
	useEffect(() => {
		lastSnapshot.current = currSnapshot
		lastAffected.current = currAffected
	})

	const proxyCache = useMemo(() => /* @__PURE__ */ new WeakMap(), [])
	return createProxy(currSnapshot.current, currAffected, proxyCache)
}
