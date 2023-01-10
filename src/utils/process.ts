import { EventEmitter } from 'node:events'

import chalk from 'chalk'
import { deepmerge } from 'deepmerge-ts'
import { OrderedSet } from 'js-sdsl'
import mem from 'mem'
import type { IBasePtyForkOptions, IPty } from 'node-pty'
import pty from 'node-pty'
import shellQuote from 'shell-quote'
import invariant from 'tiny-invariant'

import type { UnwrappedLogLineData, WrappedLogLineData } from '~/types/logs.js'
import type { ProcessEmitter } from '~/types/process.js'
import { wrapLineWithPrefix } from '~/utils/logs.js'
import { localdevState } from '~/utils/state.js'
import { getWrappedText } from '~/utils/text.js'

export class Process {
	static emitters: ProcessEmitter[] = []

	ptyProcess: IPty | null = null
	command: string[] | null
	commandOptions?: IBasePtyForkOptions
	id: string
	emitter: ProcessEmitter

	/**
		An array of all the log lines that a service has outputted, including overflowed logs.
	*/
	#unwrappedLogLinesData = new OrderedSet(
		[] as UnwrappedLogLineData[],
		(l1, l2) => l1.timestamp - l2.timestamp
	)

	#wrappedLogLineData = new OrderedSet([] as WrappedLogLineData[], (l1, l2) => {
		if (l1.timestamp === l2.timestamp) {
			return l1.wrappedLineIndex - l2.wrappedLineIndex
		} else {
			return l1.timestamp - l2.timestamp
		}
	})

	constructor({
		id,
		command,
		commandOptions,
	}: {
		id: string
		command: string[]
		commandOptions?: IBasePtyForkOptions
	}) {
		this.id = id
		this.command = command
		this.commandOptions = commandOptions

		const emitter = new EventEmitter() as ProcessEmitter
		this.emitter = emitter
		Process.emitters.push(emitter)
	}

	addLogs(unwrappedText: string, options?: { timestamp?: number }) {
		const timestamp = options?.timestamp ?? Date.now()
		// TODO: figure out how to strip cursor ansi sequences

		this.#unwrappedLogLinesData.insert({ text: unwrappedText, timestamp })
		const wrappedLine = getWrappedText(unwrappedText)
		const wrappedLogLineData = wrappedLine.map((line) => ({
			text: line,
			timestamp,
		}))
		for (const [
			wrappedLineIndex,
			wrappedLine,
		] of wrappedLogLineData.entries()) {
			this.#wrappedLogLineData.insert({ ...wrappedLine, wrappedLineIndex })
		}

		this.emitter.emit('logsAdded', {
			wrappedLine,
			unwrappedLine: unwrappedText,
		})
	}

	getUnwrappedLogLines(options: {
		withTimestamps: true
	}): UnwrappedLogLineData[]

	getUnwrappedLogLines(options?: {
		withTimestamps?: false | undefined
	}): string[]

	getUnwrappedLogLines(options?: {
		withTimestamps?: boolean
	}): string[] | UnwrappedLogLineData[] {
		const unwrappedLogLineData = [...this.#unwrappedLogLinesData]
		if (options?.withTimestamps) {
			return unwrappedLogLineData
		}

		return [...this.#unwrappedLogLinesData].map((logLine) => logLine.text)
	}

	getWrappedLogLines(options: { withTimestamps: true }): WrappedLogLineData[]
	getWrappedLogLines(options?: { withTimestamps?: false | undefined }): string[]
	getWrappedLogLines(options?: {
		withTimestamps?: boolean
	}): string[] | WrappedLogLineData[] {
		const wrappedLogLineData = [...this.#wrappedLogLineData]
		if (options?.withTimestamps) {
			return wrappedLogLineData
		}

		return wrappedLogLineData.map((logLine) => logLine.text)
	}

	spawn({ mode }: { mode: 'test' | 'development' }) {
		if (this.command === null) {
			throw new Error('No command was specified for this process')
		}

		const env: Record<string, string> = {
			...process.env,
			FORCE_COLOR: '3',
			NODE_ENV: mode,
			ENV: mode,
		}

		if (mode === 'test') {
			env.TEST = '1'
		}

		const [commandName, ...commandArgs] = this.command
		invariant(commandName !== undefined, 'commandName is not undefined')
		const commandOptions = deepmerge(
			{ name: this.id, env },
			this.commandOptions ?? {}
		)
		this.ptyProcess = pty.spawn(commandName, commandArgs, commandOptions)

		this.ptyProcess.onExit(({ exitCode }) => {
			this.emitter.emit('exited', exitCode)
		})

		this.ptyProcess.onData((data) => {
			this.addLogs(data.trim())
		})

		return this.ptyProcess
	}

	stop() {
		this.ptyProcess?.kill()
	}

	restart() {
		this.stop()
		this.spawn({ mode: 'development' })
	}
}

/**
	The order of these colors are deliberately reversed compared to the colors for services to prevent confusing services with logs
*/
const stderrLogColors = ['cyan', 'magenta', 'blue', 'yellow', 'green'] as const
let stderrLogColorsIndex = 0

export const getProcessPrefixColor = mem((_processId: string) => {
	const stderrColor =
		stderrLogColors[stderrLogColorsIndex % stderrLogColors.length]
	stderrLogColorsIndex += 1
	invariant(stderrColor, '`stderrColor` is not undefined')
	return stderrColor
})

export function spawnProcess(args: {
	id: string
	command: string | string[]
	commandOptions?: IBasePtyForkOptions
}) {
	const command =
		typeof args.command === 'string'
			? (shellQuote.parse(args.command) as string[])
			: args.command

	const process = new Process({
		id: args.id,
		command,
		commandOptions: args.commandOptions,
	})

	const listener = ({ unwrappedLine }: { unwrappedLine: string }) => {
		const prefix = `${chalk[getProcessPrefixColor(args.id)](`#${args.id}:`)} `
		const wrappedLines = wrapLineWithPrefix({ prefix, unwrappedLine })
		localdevState.wrappedLogLinesToDisplay.push(...wrappedLines)
	}

	process.emitter.on('logsAdded', listener)

	process.spawn({ mode: 'development' })
	process.emitter.on('exited', () => {
		process.emitter.removeAllListeners()
	})
}
