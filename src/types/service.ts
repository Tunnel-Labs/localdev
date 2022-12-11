import type { DevServiceSpec } from '@dialect-inc/localdev-config'
import type { IPty } from 'node-pty'

export interface DevServiceData {
	spec: DevServiceSpec
	logLines: string[]
	ptyProcess: IPty | null
	status: 'ready' | 'pending' | 'failed' | 'unknown'
}
