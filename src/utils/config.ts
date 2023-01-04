import { deepmerge } from 'deepmerge-ts'
import { findUp } from 'find-up'
import { z } from 'zod'

import type { LocaldevConfig } from '~/types/config.js'
import { localdevState } from '~/utils/store.js'

export const serviceSpecSchema = z.object({
	name: z.string().optional(),
	dependsOn: z.string().array().optional(),

	/**
		How to check if the running process is ready
	*/
	healthCheck: z
		.object({
			port: z.number(),
			path: z.string().optional(),
		})
		.optional(),

	command: z.union([
		z.object({ string: z.string() }),
		z.object({ packageName: z.string(), commandName: z.string() }),
	]),
})

export const localdevConfigSchema = z.object({
	/**
		Whether to log dev server events or not.
	*/
	logServerEvents: z.boolean().optional(),
	/**
		A list of dev services that should be logged by default in the dev server process.
	*/
	servicesToLog: z.record(z.string(), z.boolean()).optional(),

	services: z.record(z.string(), serviceSpecSchema).optional(),

	localDomains: z.string().array().optional(),
	proxyRouter: z.function().args(z.any()).returns(z.string()).optional(),
	commands: z.function().args(z.any()).returns(z.any().array()).optional(),
})

export async function getLocaldevConfigPath() {
	const configPath =
		(await findUp('localdev.config.mjs')) ??
		(await findUp('localdev.config.js')) ??
		(await findUp('localdev.config.cjs'))

	if (configPath === undefined) {
		throw new Error('localdev config file not found')
	}

	return configPath
}

export async function getLocaldevConfig() {
	const sharedLocaldevConfigPath = await getLocaldevConfigPath()
	const localLocaldevConfigPath =
		(await findUp('localdev.local.mjs')) ??
		(await findUp('localdev.local.js')) ??
		(await findUp('localdev.local.cjs'))

	const { default: sharedLocaldevConfig } = (await import(
		sharedLocaldevConfigPath
	)) as { default: LocaldevConfig }

	const localLocaldevConfig =
		localLocaldevConfigPath === undefined
			? {}
			: ((await import(localLocaldevConfigPath)) as { default: LocaldevConfig })
					.default

	return localdevConfigSchema.parse(
		deepmerge(sharedLocaldevConfig, localLocaldevConfig)
	) as LocaldevConfig
}

export async function loadLocaldevConfig() {
	localdevState.localdevConfig = await getLocaldevConfig()
}
