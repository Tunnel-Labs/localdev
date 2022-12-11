import {
	createClientOnServerEvent,
	createClientSocketEventEmitter
} from '@dialect-inc/socket'
import {
	getBufferedLogsEvent,
	logsReceivedEvent
} from '@dialect-inc/socket/events/localdev'

import { restartDevService } from '~/utils/service/restart.js'
import { getDevProcessSocket, getDevServiceRoomName } from '~/utils/socket.js'

/**
	This function is deliberately named `startDevServiceLogsStream` instead of `streamCommandLogs` because `await streamCommandLogs(...)` is misleading, looking like it'll only return when the logs are finished streaming (which is not true).
 */
export async function startDevServiceLogsStream({
	restart,
	devServiceId
}: {
	restart: boolean
	devServiceId: string
}) {
	if (restart) {
		await restartDevService({ devServiceId })
	}

	const socket = getDevProcessSocket()
	const emitSocketEvent = createClientSocketEventEmitter({ socket })
	socket.emit('joinRoom', getDevServiceRoomName({ devServiceId }), async () => {
		const { logLines } = await emitSocketEvent(getBufferedLogsEvent, {
			devServiceId
		}).getResponseData()
		process.stderr.write(logLines.join('\n') + '\n')
	})

	const onServerEvent = createClientOnServerEvent({ socket })
	onServerEvent({ event: logsReceivedEvent, devServiceId }, ({ logLines }) => {
		process.stderr.write(logLines.join('\n') + '\n')
	})
}
