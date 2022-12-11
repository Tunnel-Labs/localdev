import { log } from '@dialect-inc/logger'
import { createClientSocketEventEmitter } from '@dialect-inc/socket'
import { restartDevServiceEvent } from '@dialect-inc/socket/events/localdev'

import { getDevProcessSocket } from '~/utils/socket.js'

export async function restartDevService({
	devServiceId
}: {
	devServiceId: string
}) {
	const socket = getDevProcessSocket()
	const emitSocketEvent = createClientSocketEventEmitter({ socket })
	await emitSocketEvent(restartDevServiceEvent, {
		devServiceId
	}).getResponseData()
	log.info(`Command ${devServiceId} successfully restarted`)
}
