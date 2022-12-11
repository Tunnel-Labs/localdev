import type { DevServiceSpec } from '@dialect-inc/localdev-config'
import waitPort from 'wait-port'

export async function waitForDevServiceHealthy({
	devServiceSpec
}: {
	devServiceSpec: DevServiceSpec
}) {
	const { healthCheck } = devServiceSpec
	if (healthCheck === undefined) return
	await waitPort({
		port: healthCheck.port,
		path: healthCheck.path,
		output: 'silent'
	})
}
