import fs from 'node:fs'
import path from 'node:path'

import { deepmerge } from 'deepmerge-ts'
import { findUp } from 'find-up'
import { z } from 'zod'

import type { LocaldevConfig } from '~/types/config.js'

export const serviceSpecSchema = z.object({
	name: z.string().optional(),
	dependsOn: z.string().array().optional(),
	startAutomatically: z.boolean().default(true),

	/**
		How to check if the running process is ready
	*/
	healthCheck: z
		.object({
			port: z.number(),
			path: z.string().optional(),
		})
		.optional(),

	command: z.intersection(
		z.object({
			cwd: z.string().optional(),
			env: z.record(z.string(), z.string()).optional(),
		}),
		z.union([
			z.object({ string: z.string() }),
			z.object({ packageName: z.string(), commandName: z.string() }),
		])
	),
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

	localProxy: z
		.union([
			z.literal(false),
			z.object({
				port: z.number().optional().default(7357),
				localDomains: z.string().array().optional(),
				proxyRouter: z
					.function()
					.args(z.any())
					.returns(z.string().optional())
					.optional(),
			}),
		])
		.default(false),
	commands: z.function().args(z.any()).returns(z.any().array()).optional(),
})

export async function getLocaldevConfigPath(options?: { configPath?: string }) {
	if (options?.configPath !== undefined) {
		const fullConfigPath = path.resolve(process.cwd(), options.configPath)
		if (!fs.existsSync(fullConfigPath)) {
			throw new Error(
				`localdev config file not found at specified path \`${fullConfigPath}\``
			)
		}

		return fullConfigPath
	}

	const configPath =
		(await findUp('localdev.config.mjs')) ??
		(await findUp('localdev.config.js')) ??
		(await findUp('localdev.config.cjs'))

	if (configPath === undefined) {
		throw new Error('localdev config file not found')
	}

	return configPath
}

export async function getLocaldevLocalConfigPath(options?: {
	localConfigPath?: string
}): Promise<string | undefined> {
	if (options?.localConfigPath !== undefined) {
		const fullLocalConfigPath = path.resolve(
			process.cwd(),
			options.localConfigPath
		)
		if (!fs.existsSync(fullLocalConfigPath)) {
			throw new Error(
				`local localdev config file not found at specified path \`${fullLocalConfigPath}\``
			)
		}

		return fullLocalConfigPath
	}

	const localLocaldevConfigPath =
		(await findUp('localdev.local.mjs')) ??
		(await findUp('localdev.local.js')) ??
		(await findUp('localdev.local.cjs'))

	return localLocaldevConfigPath
}

export async function getLocaldevConfig({
	configPath,
	localConfigPath,
}: {
	configPath: string
	localConfigPath?: string
}) {
	const { default: sharedLocaldevConfig } = (await import(configPath)) as {
		default: LocaldevConfig
	}

	const localLocaldevConfig =
		localConfigPath === undefined
			? {}
			: ((await import(localConfigPath)) as { default: LocaldevConfig }).default

	return localdevConfigSchema.parse(
		deepmerge(sharedLocaldevConfig, localLocaldevConfig)
	) as LocaldevConfig
}
