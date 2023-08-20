import { execa, type Options as ExecaOptions } from 'execa'

let hasSudoBeenCalled = false

/**
	Only uses `stdio: 'inherit'` on the first sudo call
*/
async function sudo(commands: string[], options?: ExecaOptions) {
	if (hasSudoBeenCalled) {
		return execa('sudo', commands, options)
	} else {
		hasSudoBeenCalled = true
		return execa('sudo', commands, options)
	}
}

export const cli = {
	sudo,
}
