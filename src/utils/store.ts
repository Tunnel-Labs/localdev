import { reactive } from '@vue/reactivity'
import { watch } from '@vue-reactivity/watch'
import type { FastifyInstance } from 'fastify'
import type { DOMElement, Instance } from 'ink'
import type React from 'react'

import type { Raw } from '~/utils/raw.js'
import type { TerminalUpdater } from '~/utils/terminal.js'

interface LocaldevStoreState {
	app: Raw<FastifyInstance> | null

	activeHelpCommand: string | null

	activeCommandBoxPaneComponent: Raw<React.FC> | null
	nextOverflowedWrappedLogLineIndexToOutput: number
	logsBoxIncludingTopLineHeight: number | null

	/**
		The ID of the service whose logs are displayed in the logs box. `null` represents the default services specified in `localdev.config.cjs`.
	*/
	logsBoxServiceId: string | null

	/**
		The ID of the service that's currently hijacked (`null` means no service is currently being hijacked)
	*/
	hijackedServiceId: string | null

	/**
		The current input inside the command box
	*/
	commandBoxInput: string

	/**
		A history of the commands that were run
	*/
	commandHistory: string[]

	/**
		The current command history index (changed by pressing the up/down arrow inside the command box). A value equal to the length of `commandHistory` indicate that no past command is selected.
	*/
	currentCommandHistoryIndex: number

	logScrollModeState:
		| { active: true; wrappedLogLinesLength: number }
		| { active: false }

	inkInstance: Raw<
		Instance & {
			isUnmounted: boolean
			rootNode: DOMElement
		}
	> | null

	terminalUpdater: Raw<TerminalUpdater> | null

	/**
		An array containing the all the log lines that should be displayed, including overflowed lines.
		Note: `wrappedLogLinesToDisplay` is a mutable string array and not a computed property because we want to be able to
		incrementally update it instead of always re-computing it.
	*/
	wrappedLogLinesToDisplay: string[]

	servicesEnabled: boolean
}

function createLocaldevStore() {
	const store = reactive<LocaldevStoreState>({
		app: null,
		activeHelpCommand: null,
		servicesEnabled: true,
		activeCommandBoxPaneComponent: null,
		nextOverflowedWrappedLogLineIndexToOutput: 0,
		logsBoxIncludingTopLineHeight: null,
		logsBoxServiceId: null,
		hijackedServiceId: null,
		commandBoxInput: '',
		commandHistory: [],
		currentCommandHistoryIndex: 0,
		logScrollModeState: {
			active: false,
		},
		inkInstance: null,
		terminalUpdater: null,
		wrappedLogLinesToDisplay: [],
	})

	// Whenever the logs box height changes, we want to update the overflowed lines since their positions will have changed
	watch(
		() => store.activeCommandBoxPaneComponent,
		() => {
			if (store.terminalUpdater !== null) {
				store.terminalUpdater.updateTerminal({
					force: true,
					updateOverflowedLines: true,
				})
			}
		}
	)

	return store
}

export const localdevStore = createLocaldevStore()
