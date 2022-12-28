import fs from 'node:fs'
import path from 'node:path'

import { homebrew } from 'cli-specs'
import { defineCliTool } from 'cli-specs'
import { installHomebrewPackage } from 'cli-specs'
import type { Options as ExecaOptions } from 'execa'
import { execa } from 'execa'
import { outdent } from 'outdent'

let hasSudoBeenCalled = false

/**
	Only uses `stdio: 'inherit'` on the first sudo call
*/
function sudo(commands: string[], options?: ExecaOptions) {
	if (!hasSudoBeenCalled) {
		hasSudoBeenCalled = true
		return execa('sudo', commands, {
			stdio: 'inherit',
			...options
		})
	} else {
		return execa('sudo', commands, options)
	}
}

const mkcert = defineCliTool({
	commandName: 'mkcert',
	description: outdent`
		It looks like you don't have \`mkcert\` installed.
		\`mkcert\` is a tool for creating trusted local
		certificates, needed for local Kubernetes development.
		To install \`mkcert\`, please visit the following link:
		https://github.com/FiloSottile/mkcert#installation
	`,
	install: async () => installHomebrewPackage('mkcert'),
	defaultExecaOptions: {
		stdout: 'pipe',
		stderr: 'pipe'
	}
})

export const dnsmasq = defineCliTool({
	commandName: 'dnsmasq',
	description: outdent`
		\`dnsmasq\` is used for resolving local *.test domains.
	`,
	install: async () => installHomebrewPackage('dnsmasq'),
	async exists() {
		const { stdout: homebrewPrefix } = await homebrew(['--prefix'])
		const possibleDnsmasqPaths = [
			'/usr/local/sbin/dnsmasq',
			path.join(homebrewPrefix, 'sbin/dnsmasq')
		]

		return possibleDnsmasqPaths.some((possibleDnsmasqPath) =>
			fs.existsSync(possibleDnsmasqPath)
		)
	},
	defaultExecaOptions: {
		stdio: 'inherit'
	}
})

export const cli = {
	mkcert,
	dnsmasq,
	sudo,
	homebrew
}
