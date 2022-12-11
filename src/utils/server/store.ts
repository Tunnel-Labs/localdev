import type {
	DevServiceSpec,
	LocaldevConfig
} from '@dialect-inc/localdev-config'
import type { FastifyInstance } from 'fastify'
import type { DOMElement, Instance } from 'ink'
import type React from 'react'
import shellQuote from 'shell-quote'
import terminalSize from 'term-size'
import wrapAnsi from 'wrap-ansi'
import create from 'zustand'
import { combine } from 'zustand/middleware'

import type { DevServiceData } from '~/types/service.js'
import type { InferStoreType } from '~/types/zustand.js'
import { localdevCommandSpecs } from '~/utils/server/commands.js'
import { createSelectors } from '~/utils/store.js'
import type { TerminalUpdater } from '~/utils/terminal.js'
import {
	disableTerminalMouseSupport,
	enableTerminalMouseSupport
} from '~/utils/terminal.js'

/**
	Get the log lines as an array of lines as they would be displayed in the terminal
*/
function getWrappedLogLine({
	logLine,
	terminalWidth
}: {
	logLine: string
	terminalWidth: number
}) {
	const wrappedLogLines: string[] = []
	const wrappedLine = (wrapAnsi as unknown as typeof wrapAnsi['default'])(
		logLine,
		terminalWidth,
		{
			trim: false,
			hard: true
		}
	)

	wrappedLogLines.push(...wrappedLine.split('\n'))

	return wrappedLogLines
}

/**
	Note that we need to use the `useZustand` hook because of https://github.com/vadimdemedes/ink/issues/539
*/
export const localdevServerStore = createSelectors(
	create(
		combine(
			{
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Will be guaranteed to be initialized when `app` is used
				app: undefined! as FastifyInstance,

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Will be guaranteed to be initialized when `localdevConfig` is used
				localdevConfig: undefined! as LocaldevConfig,

				/**
					We keep track of the unwrapped log lines so we can recalculate the wrapped log lines when the terminal is resized
				*/
				unwrappedLogLines: [] as string[],
				wrappedLogLines: [] as string[],

				/**
					We use an object instead of an ES6 Map to preserve reactivity with zustand
				*/
				devServicesData: {} as Record<string, DevServiceData>,

				activeCommandBoxPaneComponent: null as React.FC | null,
				overflowedWrappedLogLines: [] as string[],
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
					active: false
				} as
					| { active: true; wrappedLogLinesLength: number }
					| { active: false },

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Will be guaranteed to be initialized when `inkInstance` is used
				inkInstance: undefined! as Instance & {
					isUnmounted: boolean
					rootNode: DOMElement
				},

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Will be guaranteed to be initialized when `terminalUpdater` is used
				terminalUpdater: undefined! as TerminalUpdater
			},
			(set, get) => ({
				addLogLine(line: string, options?: { addUnwrapped?: boolean }) {
					const wrappedLogLine = getWrappedLogLine({
						logLine: line,
						terminalWidth: terminalSize().columns
					})
					let newWrappedLogLines = [...get().wrappedLogLines, ...wrappedLogLine]
					let overflowedWrappedLogLines: string[] = []

					const { logsBoxIncludingTopLineHeight } = get()
					if (
						logsBoxIncludingTopLineHeight !== null &&
						newWrappedLogLines.length > logsBoxIncludingTopLineHeight
					) {
						const numOverflowedLogLines =
							newWrappedLogLines.length - logsBoxIncludingTopLineHeight
						overflowedWrappedLogLines = newWrappedLogLines.slice(
							0,
							numOverflowedLogLines
						)
						newWrappedLogLines = newWrappedLogLines.slice(numOverflowedLogLines)
					}

					const addUnwrapped = options?.addUnwrapped ?? true

					if (addUnwrapped) {
						set((state) => ({
							unwrappedLogLines: [...state.unwrappedLogLines, line],
							wrappedLogLines: newWrappedLogLines,
							overflowedWrappedLogLines: [
								...state.overflowedWrappedLogLines,
								...overflowedWrappedLogLines
							]
						}))
					} else {
						set((state) => ({
							wrappedLogLines: newWrappedLogLines,
							overflowedWrappedLogLines: [
								...state.overflowedWrappedLogLines,
								...overflowedWrappedLogLines
							]
						}))
					}
				},
				resetLogLines() {
					// Reset the log lines that are computed based on the unwrapped log lines
					set({
						wrappedLogLines: [],
						overflowedWrappedLogLines: [],
						nextOverflowedWrappedLogLineIndexToOutput: 0
					})

					// Manually add each line back (now taking into account of the new terminal width) to repopulate the computed state properties
					for (const unwrappedLogLine of get().unwrappedLogLines) {
						;(get() as InferStoreType<typeof localdevServerStore>).addLogLine(
							unwrappedLogLine,
							{ addUnwrapped: false }
						)
					}
				},
				clearLogs() {
					set({
						unwrappedLogLines: [],
						wrappedLogLines: [],
						overflowedWrappedLogLines: [],
						nextOverflowedWrappedLogLineIndexToOutput: 0
					})
				},
				getDevServiceData({ devServiceId }: { devServiceId: string }) {
					const devServiceData = get().devServicesData[devServiceId]
					if (devServiceData === undefined) {
						throw new Error(
							`Could not get dev command data for command \`${devServiceId}\``
						)
					}

					return devServiceData
				},
				setDevServiceData({
					devServiceId,
					devServiceData
				}: {
					devServiceId: string
					devServiceData: DevServiceData
				}) {
					set((state) => ({
						devServicesData: {
							...state.devServicesData,
							[devServiceId]: devServiceData
						}
					}))
				},
				updateDevServiceData({
					devServiceId,
					devServiceDataUpdates
				}: {
					devServiceId: string
					devServiceDataUpdates: Partial<DevServiceData>
				}) {
					const devServiceData = get().devServicesData[devServiceId]
					if (devServiceData === undefined) {
						throw new Error(
							`Can't update dev service data ${devServiceId} because there is no existing data.`
						)
					}

					set((state) => ({
						devServicesData: {
							...state.devServicesData,
							[devServiceId]: {
								...devServiceData,
								...devServiceDataUpdates
							}
						}
					}))
				},
				setActiveCommandBoxPaneComponent(component: React.FC | null) {
					set({ activeCommandBoxPaneComponent: component })
				},
				setLogsBoxIncludingTopLineHeight(height: number) {
					set({ logsBoxIncludingTopLineHeight: height })
				},
				setLocaldevConfig(localdevConfig: LocaldevConfig) {
					set({ localdevConfig })
				},
				setLogsBoxServiceId(serviceId: string | null) {
					set({ logsBoxServiceId: serviceId })
				},
				setHijackedServiceId(serviceId: string | null) {
					set({ hijackedServiceId: serviceId })
				},
				getDevServiceSpec({
					serviceId
				}: {
					serviceId: string
				}): DevServiceSpec {
					const spec = get().localdevConfig.devServiceSpecs.find(
						(spec) => spec.id === serviceId
					)
					if (spec === undefined) {
						throw new Error(`Spec for service with ID ${serviceId} not found.`)
					}

					return spec
				},
				async runCommand(command: string) {
					const commandName = command.split(' ')[0]
					const localdevCommandSpec = localdevCommandSpecs.find(
						(commandSpec) => commandSpec.command.name() === commandName
					)

					if (localdevCommandSpec !== undefined) {
						await localdevCommandSpec.command.parseAsync(
							shellQuote.parse(command) as string[],
							{ from: 'user' }
						)
					}
				},
				async runCommandInCommandBox() {
					const { commandBoxInput, setCommandBoxInput, runCommand } =
						get() as InferStoreType<typeof localdevServerStore>
					const command = commandBoxInput
					set((state) => ({
						commandHistory: [...state.commandHistory, command],
						currentCommandHistoryIndex: state.commandHistory.length + 1
					}))
					setCommandBoxInput('')
					await runCommand(command)
				},
				setCommandBoxInput(input: string) {
					set({ commandBoxInput: input })
				},
				selectPreviousCommand() {
					const { currentCommandHistoryIndex, commandHistory } = get()
					if (currentCommandHistoryIndex > 0) {
						set({
							currentCommandHistoryIndex: currentCommandHistoryIndex - 1,
							commandBoxInput:
								commandHistory[currentCommandHistoryIndex - 1] ?? ''
						})
					}
				},
				selectNextCommand() {
					const { commandHistory, currentCommandHistoryIndex } = get()
					if (currentCommandHistoryIndex < commandHistory.length) {
						set({
							currentCommandHistoryIndex: currentCommandHistoryIndex + 1,
							commandBoxInput:
								commandHistory[currentCommandHistoryIndex + 1] ?? ''
						})
					}
				},
				activateLogScrollMode() {
					// We update the overflowed logs in the terminal
					get().terminalUpdater.updateTerminal({ updateOverflowedLines: true })

					// We pause further updates by setting `logScrollModeState.active` to true
					set({
						logScrollModeState: {
							active: true,
							wrappedLogLinesLength: get().wrappedLogLines.length
						}
					})

					// We output a message to the user
					process.stderr.write('Press any key to resume...')

					// We disable terminal mouse events so that the user can use the terminal's native handler for mouse and scroll events
					disableTerminalMouseSupport()
				},
				deactivateLogScrollMode() {
					set({ logScrollModeState: { active: false } })
					// We re-enable terminal mouse events so that we can detect when the user scrolls (so we know to update the overflowed logs)
					enableTerminalMouseSupport()
				},
				setInkInstance(inkInstance: Instance) {
					// @ts-expect-error: Internal properties of ink instance not exposed
					set({ inkInstance })
				},
				setTerminalUpdater(terminalUpdater: TerminalUpdater) {
					set({ terminalUpdater })
				}
			})
		)
	)
)
