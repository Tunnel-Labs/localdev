import { defineSocketEventHandler } from '@dialect-inc/socket'
import { restartDevServiceEvent } from '@dialect-inc/socket/events/localdev'

import { spawnProcessFromDevService } from '~/utils/process.js'
import { localdevServerStore } from '~/utils/server/store.js'

export const restartDevServiceEventHandler = defineSocketEventHandler(
	restartDevServiceEvent
).setHandler((payload) => {
	const { devServiceId } = payload
	const { getDevServiceData } = localdevServerStore.getState()
	const devServiceData = getDevServiceData({
		devServiceId
	})
	const { ptyProcess } = devServiceData
	if (ptyProcess === null) {
		throw new Error(
			`Dev command \`${devServiceId}\` had no active process; nothing to restart`
		)
	}

	ptyProcess.kill()
	devServiceData.ptyProcess = spawnProcessFromDevService({
		devServiceSpec: devServiceData.spec,
		mode: 'development'
	})

	return {
		data: true
	}
	// log.event(
	// 	`Dev command \`${devServiceId as string} was successfully restarted`
	// )
})
