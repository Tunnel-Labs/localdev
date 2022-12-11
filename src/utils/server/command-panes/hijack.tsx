import { Text, useInput } from 'ink'
import { useZustand } from 'use-zustand'

import { localdevServerStore } from '~/utils/server/store.js'
import { getDevServiceName } from '~/utils/service/name.js'

/**
	The logs pane just informs the user that logs are being streamed (the logs themselves aren't displayed in the logs pane, but rather in the logs box)
*/
export function HijackPane() {
	const { hijackedServiceId, getDevServiceSpec, setHijackedServiceId } =
		useZustand(
			localdevServerStore,
			({ hijackedServiceId, getDevServiceSpec, setHijackedServiceId }) => ({
				hijackedServiceId,
				getDevServiceSpec,
				setHijackedServiceId
			})
		)

	// The logs pane should not be displayed if `logsBoxServiceId` is null
	if (hijackedServiceId === null) {
		return null
	}

	useInput((_input, key) => {
		if (key.shift && key.escape) {
			setHijackedServiceId(null)
		}
	})

	return (
		<Text>
			Hijacking service{' '}
			{getDevServiceName({
				devServiceSpec: getDevServiceSpec({ serviceId: hijackedServiceId })
			})}{' '}
			(press Shift+Escape to stop hijacking)
		</Text>
	)
}
