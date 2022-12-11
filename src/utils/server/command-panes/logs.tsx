import { Text } from 'ink'
import { useZustand } from 'use-zustand'

import { localdevServerStore } from '~/utils/server/store.js'
import { getDevServiceName } from '~/utils/service/name.js'

/**
	The logs pane just informs the user that logs are being streamed (the logs themselves aren't displayed in the logs pane, but rather in the logs box)
*/
export function LogsPane() {
	const logsBoxServiceId = useZustand(
		localdevServerStore,
		(state) => state.logsBoxServiceId
	)
	const getDevServiceSpec = useZustand(
		localdevServerStore,
		(state) => state.getDevServiceSpec
	)

	// The logs pane should not be displayed if `logsBoxServiceId` is null
	if (logsBoxServiceId === null) {
		return null
	}

	return (
		<Text>
			Streaming logs of service{' '}
			{getDevServiceName({
				devServiceSpec: getDevServiceSpec({ serviceId: logsBoxServiceId })
			})}
		</Text>
	)
}
