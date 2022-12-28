import { type Command } from 'commander'
import type { z } from 'zod'

import { type LocaldevCommandSpec } from '~/types/command.js'
import { type createCommand, type defineCommandSpec } from '~/utils/commands.js'

// We deliberately use a relative path here so that the type comment in `localdev.config.cjs` properly resolves
import type {
	localdevConfigSchema,
	serviceSpecSchema,
} from '../utils/config.js'

export type LocaldevConfig = Omit<
	z.infer<typeof localdevConfigSchema>,
	'commands'
> & {
	commands?(args: {
		createCommand: typeof createCommand
		defineCommandSpec: typeof defineCommandSpec
		Command: typeof Command
	}): LocaldevCommandSpec[]
}

export type ServiceSpec = z.infer<typeof serviceSpecSchema> & { id: string }
