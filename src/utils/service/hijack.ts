import { createClientSocketEventEmitter } from '@dialect-inc/socket'
import { stdinDataEvent } from '@dialect-inc/socket/events/localdev'

import { startDevServiceLogsStream } from '~/utils/service/logs.js'
import { getDevProcessSocket } from '~/utils/socket.js'

export async function hijackDevService({
	devServiceId
}: {
	devServiceId: string
}) {
	await startDevServiceLogsStream({ devServiceId, restart: false })
	const socket = getDevProcessSocket()
	const emitSocketEvent = createClientSocketEventEmitter({ socket })

	process.stdin.setRawMode(true)
	process.stdin.on('data', (data: Buffer) => {
		// Forward stdin to the dev process
		emitSocketEvent(stdinDataEvent, { devServiceId, input: data.toString() })
	})
}
