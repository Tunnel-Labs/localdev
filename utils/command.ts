import shellQuote from 'shell-quote';
import { getLocaldevCommandSpecs } from '../utils/commands.js';
import { localdevState } from '../utils/state.js';

export async function runCommand(command: string) {
	const commandName = command.split(' ')[0];
	const localdevCommandSpec = getLocaldevCommandSpecs().find(
		(commandSpec) => commandSpec.command.name() === commandName,
	);

	if (localdevCommandSpec !== undefined) {
		await localdevCommandSpec.command.parseAsync(
			// When passing arguments as user, commander doesn't expect to receive the command name
			(shellQuote.parse(command) as string[]).slice(1),
			{ from: 'user' },
		);
	}
}

export async function runCommandFromCommandBox() {
	const command = localdevState.commandBoxInput;
	localdevState.commandHistory.push(command);
	localdevState.currentCommandHistoryIndex += 1;
	localdevState.commandBoxInput = '';
	await runCommand(command);
}

export function selectPreviousCommand() {
	const { currentCommandHistoryIndex, commandHistory } = localdevState;
	if (currentCommandHistoryIndex > 0) {
		localdevState.currentCommandHistoryIndex -= 1;
		localdevState.commandBoxInput =
			commandHistory[currentCommandHistoryIndex - 1] ?? '';
	}
}

export function selectNextCommand() {
	const { commandHistory, currentCommandHistoryIndex } = localdevState;
	if (currentCommandHistoryIndex < commandHistory.length) {
		localdevState.currentCommandHistoryIndex += 1;
		localdevState.commandBoxInput =
			commandHistory[currentCommandHistoryIndex + 1] ?? '';
	}
}
