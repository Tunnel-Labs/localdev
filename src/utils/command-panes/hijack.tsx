import { Text, useInput } from 'ink'

import { useReactiveState } from '~/utils/reactivity.js'
import { Service } from '~/utils/service.js'
import { localdevStore } from '~/utils/store.js'

/**
	The logs pane just informs the user that logs are being streamed (the logs themselves aren't displayed in the logs pane, but rather in the logs box)
*/
export function HijackPane() {
	const { hijackedServiceId } = useReactiveState(() => ({
		hijackedServiceId: localdevStore.hijackedServiceId,
	}))

	// The logs pane should not be displayed if `logsBoxServiceId` is null
	if (hijackedServiceId === null) {
		return null
	}

	useInput((_input, key) => {
		if (key.shift && key.escape) {
			localdevStore.hijackedServiceId = null
		}
	})

	return (
		<Text>
			Hijacking service {Service.get(hijackedServiceId).name} (press
			Shift+Escape to stop hijacking)
		</Text>
	)
}
