import type { DevServiceSpec } from '@dialect-inc/localdev-config'
import { getPackageDir } from '@dialect-inc/paths'
import type { IPty } from 'node-pty'
import pty from 'node-pty'
import shellQuote from 'shell-quote'
import invariant from 'tiny-invariant'

import { getDevServiceName } from '~/utils/service/name.js'

export function spawnProcessFromDevService({
	devServiceSpec,
	mode
}: {
	devServiceSpec: DevServiceSpec
	mode: 'test' | 'development'
}) {
	let ptyProcess: IPty

	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		FORCE_COLOR: 'true',
		NODE_ENV: mode,
		APP_ENV: mode
	}

	if (mode === 'test') {
		env.TEST = '1'
	}

	if ('string' in devServiceSpec.command) {
		const commandSegments = shellQuote.parse(
			devServiceSpec.command.string
		) as string[]
		const commandName = commandSegments[0]
		invariant(commandName !== undefined, 'commmandName should exist')
		const commandArgs = commandSegments.slice(1)
		ptyProcess = pty.spawn(commandName, commandArgs, {
			name: getDevServiceName({ devServiceSpec }),
			env
		})
	} else {
		ptyProcess = pty.spawn(
			'pnpm',
			['--silent', 'run', devServiceSpec.command.commandName],
			{
				name: getDevServiceName({ devServiceSpec }),
				cwd: getPackageDir({ packageName: devServiceSpec.command.packageName }),
				env
			}
		)
	}

	return ptyProcess
}
