import { defineSocketEventHandler } from '@dialect-inc/socket'
import { getBufferedLogsEvent } from '@dialect-inc/socket/events/localdev'

import { localdevServerStore } from '~/utils/server/store.js'

/**
	Sent by the dev watchers to the dev server.
	Tells the dev server to send the buffered logs for a dev process.
*/
export const getBufferedLogsEventHandler = defineSocketEventHandler(
	getBufferedLogsEvent
).setHandler((payload) => {
	const { getDevServiceData } = localdevServerStore.getState()
	const devServiceData = getDevServiceData({
		devServiceId: payload.devServiceId
	})

	return {
		data: {
			logLines: devServiceData.logLines
		}
	}
})
