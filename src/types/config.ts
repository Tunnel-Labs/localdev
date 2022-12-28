import type { z } from 'zod'

// We deliberately use a relative path here so that the type comment in `localdev.config.cjs` properly resolves
import type {
	localdevConfigSchema,
	serviceSpecSchema,
} from '../utils/config.js'

export type LocaldevConfig = z.infer<typeof localdevConfigSchema>

export type ServiceSpec = z.infer<typeof serviceSpecSchema> & { id: string }
