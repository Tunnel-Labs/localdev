import { defineCliTool } from 'cli-specs'
import commandExists from 'command-exists'
import type { Options as ExecaOptions } from 'execa'
import { execa } from 'execa'
import { outdent } from 'outdent'

import { localdevState } from '~/utils/state.js'

let hasSudoBeenCalled = false

/**
	Only uses `stdio: 'inherit'` on the first sudo call
*/
function sudo(commands: string[], options?: ExecaOptions) {
	if (hasSudoBeenCalled) {
		return execa('sudo', commands, options)
	} else {
		hasSudoBeenCalled = true
		return execa('sudo', commands, options)
	}
}

const mkcert = defineCliTool({
	commandName: 'mkcert',
	async runCommand(args, options) {
		const mkcertBinPath =
			localdevState.localdevConfig.binPaths?.mkcert ?? 'mkcert'
		return { process: execa(mkcertBinPath, args, options) }
	},
	async exists() {
		const mkcertBinPath =
			localdevState.localdevConfig.binPaths?.mkcert ?? 'mkcert'
		return commandExists(mkcertBinPath)
			.then(() => true)
			.catch(() => false)
	},
	description: outdent`
		It looks like you don't have \`mkcert\` installed.
		\`mkcert\` is a tool for creating trusted local
		certificates, needed for local Kubernetes development.
		To install \`mkcert\`, please visit the following link:
		https://github.com/FiloSottile/mkcert#installation
	`,
	defaultExecaOptions: {
		stdout: 'pipe',
		stderr: 'pipe',
	},
})

export const dnsmasq = defineCliTool({
	commandName: 'dnsmasq',
	description: outdent`
		\`dnsmasq\` is used for resolving local *.test domains.
	`,
	async runCommand(args, options) {
		const dnsmasqBinPath =
			localdevState.localdevConfig.binPaths?.dnsmasq ?? 'dnsmasq'
		// DNS needs sudo permissions
		return { process: execa('sudo', [dnsmasqBinPath, ...args], options) }
	},
	async exists() {
		const dnsmasqBinPath =
			localdevState.localdevConfig.binPaths?.dnsmasq ?? 'dnsmasq'
		return commandExists(dnsmasqBinPath)
			.then(() => true)
			.catch(() => false)
	},
	defaultExecaOptions: {
		stdio: 'inherit',
	},
})

export const certutil = defineCliTool({
	commandName: 'certutil',
	description: outdent`
		\`certutil\` is needed for installing mkcert's certificates on Linux.
	`,
	async runCommand(args, options) {
		const certutilBinPath =
			localdevState.localdevConfig.binPaths?.certutil ?? 'certutil'
		return { process: execa(certutilBinPath, args, options) }
	},
	async exists() {
		const certutilBinPath =
			localdevState.localdevConfig.binPaths?.certutil ?? 'certutil'
		return commandExists(certutilBinPath)
			.then(() => true)
			.catch(() => false)
	},
	defaultExecaOptions: {
		stdio: 'inherit',
	},
})

export const cli = {
	certutil,
	mkcert,
	dnsmasq,
	sudo,
}
