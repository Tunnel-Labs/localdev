import { log } from '@dialect-inc/logger'
import { servicesData } from '@dialect-inc/services-data'
import { createClientOnServerEvent } from '@dialect-inc/socket'
import { devServiceExitedEvent } from '@dialect-inc/socket/events/localdev'
import onetime from 'onetime'
import type { Socket } from 'socket.io-client'
import * as io from 'socket.io-client'

export const getDevProcessSocket: () => Socket = onetime(() =>
	io.connect(`http://localhost:${servicesData.localdev.port}`)
)

export function registerExitHandlers({
	devServiceId
}: {
	devServiceId: string
}) {
	const socket = getDevProcessSocket()

	const onServerEvent = createClientOnServerEvent({ socket })
	onServerEvent({ event: devServiceExitedEvent, devServiceId }, (input) => {
		process.exit(input.exitCode)
	})

	socket.on('disconnect', (reason) => {
		log.error(`Disconnected from dev server: ${reason}. Exiting...`)
		process.exit(1)
	})
}

export const getDevServiceRoomName = ({
	devServiceId
}: {
	devServiceId: string
}) => `devService:${devServiceId}`
