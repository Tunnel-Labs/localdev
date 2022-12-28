import path from 'node:path'

import onetime from 'onetime'

import { getLocaldevConfigPath } from '~/utils/config.js'

export const getProjectPath = onetime(async () =>
	path.dirname(await getLocaldevConfigPath())
)
