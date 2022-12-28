import shellQuote from 'shell-quote'

import { getLocaldevCommandSpecs } from '~/utils/commands.js'
import { localdevStore } from '~/utils/store.js'

export async function runCommand(command: string) {
	const commandName = command.split(' ')[0]
	const localdevCommandSpec = getLocaldevCommandSpecs().find(
		(commandSpec) => commandSpec.command.name() === commandName
	)

	if (localdevCommandSpec !== undefined) {
		await localdevCommandSpec.command.parseAsync(
			// When passing arguments as user, commander doesn't expect to receive the command name
			(shellQuote.parse(command) as string[]).slice(1),
			{ from: 'user' }
		)
	}
}

export async function runCommandFromCommandBox() {
	const command = localdevStore.commandBoxInput
	localdevStore.commandHistory.push(command)
	localdevStore.currentCommandHistoryIndex += 1
	localdevStore.commandBoxInput = ''
	await runCommand(command)
}

export function selectPreviousCommand() {
	const { currentCommandHistoryIndex, commandHistory } = localdevStore
	if (currentCommandHistoryIndex > 0) {
		localdevStore.currentCommandHistoryIndex -= 1
		localdevStore.commandBoxInput =
			commandHistory[currentCommandHistoryIndex - 1] ?? ''
	}
}

export function selectNextCommand() {
	const { commandHistory, currentCommandHistoryIndex } = localdevStore
	if (currentCommandHistoryIndex < commandHistory.length) {
		localdevStore.currentCommandHistoryIndex += 1
		localdevStore.commandBoxInput =
			commandHistory[currentCommandHistoryIndex + 1] ?? ''
	}
}
