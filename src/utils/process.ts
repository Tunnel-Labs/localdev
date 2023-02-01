import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import { deepmerge } from 'deepmerge-ts'
import { jsonl } from 'js-jsonl'
import mem from 'mem'
import { nanoid } from 'nanoid-nice'
import type { IBasePtyForkOptions, IPty } from 'node-pty'
import pty from 'node-pty'
import shellQuote from 'shell-quote'
import invariant from 'tiny-invariant'

import { type UnwrappedLogLineData } from '~/types/logs.js'
import type { ProcessEmitter } from '~/types/process.js'
import { localdevState } from '~/utils/state.js'

/**
	We deliberately don't store unwrapped log lines in memory because they can be extremely large. Instead, they're saved in temporary files.
*/
export class Process {
	static emitters: ProcessEmitter[] = []

	ptyProcess: IPty | null = null
	command: string[] | null
	commandOptions?: IBasePtyForkOptions
	id: string
	emitter: ProcessEmitter

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

	async addLogs(text: string, options?: { timestamp?: number }) {
		const timestamp = options?.timestamp ?? Date.now()

		const unwrappedLineId = nanoid()
		// TODO: figure out how to strip cursor ansi sequences
		await fs.promises.appendFile(
			await this.#getLogsFilePath(),
			JSON.stringify({
				id: unwrappedLineId,
				timestamp,
				text,
			}) + '\n'
		)

		this.emitter.emit('logsAdded', { text, timestamp, id: unwrappedLineId })
	}

	async getUnwrappedLogLinesData(): Promise<UnwrappedLogLineData[]> {
		const logsFilePath = await this.#getLogsFilePath()
		if (fs.existsSync(logsFilePath)) {
			return jsonl.parse<UnwrappedLogLineData>(
				await fs.promises.readFile(logsFilePath, 'utf8')
			)
		} else {
			return []
		}
	}

	spawn() {
		if (this.command === null) {
			throw new Error('No command was specified for this process')
		}

		const env: Record<string, string> = {
			...process.env,
			FORCE_COLOR: '3',
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

		this.ptyProcess.onData(async (data) => {
			await this.addLogs(data)
		})

		return this.ptyProcess
	}

	stop() {
		this.ptyProcess?.kill()
	}

	restart() {
		this.stop()
		this.spawn()
	}

	async #getLogsFilePath() {
		const localdevLogsDir = path.join(
			localdevState.projectPath,
			'node_modules/.localdev/logs'
		)
		const logsFilePath = path.join(localdevLogsDir, `${this.id}.jsonl`)
		await fs.promises.mkdir(localdevLogsDir, { recursive: true })
		return logsFilePath
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

	const logsAddedListener = ({ text }: UnwrappedLogLineData) => {
		void process.addLogs(text)
	}

	process.emitter.on('logsAdded', logsAddedListener)

	process.spawn()
	process.emitter.on('exited', () => {
		process.emitter.removeAllListeners()
	})
}
