import type { DevServiceSpec } from '@dialect-inc/localdev-config'

export function getDevServiceName({
	devServiceSpec
}: {
	devServiceSpec: DevServiceSpec
}): string {
	return devServiceSpec.name ?? devServiceSpec.id
}
