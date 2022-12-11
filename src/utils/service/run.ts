import type { DevServiceSpec } from '@dialect-inc/localdev-config'
import { createServerSocketEventEmitter } from '@dialect-inc/socket'
import {
	devServiceExitedEvent,
	logsReceivedEvent
} from '@dialect-inc/socket/events/localdev'
import chalk from 'chalk'
import mem from 'mem'
import splitLines from 'split-lines'
import invariant from 'tiny-invariant'

import { spawnProcessFromDevService } from '~/utils/process.js'
import { localdevServerStore } from '~/utils/server/store.js'
import { waitForDevServiceHealthy } from '~/utils/service/health.js'
import { getDevServiceName } from '~/utils/service/name.js'

const stderrLogColors = ['green', 'yellow', 'blue', 'magenta', 'cyan'] as const
let stderrLogColorsIndex = 0

const getLogPrefixColor = mem((_serviceId: string) => {
	const stderrColor =
		stderrLogColors[stderrLogColorsIndex % stderrLogColors.length]
	stderrLogColorsIndex += 1
	invariant(stderrColor, '`stderrColor` is not undefined')
	return stderrColor
})

/**
	Takes a dev command schema because it could be called with a dev command schema that isn't specified in `localdev.config.cjs` (and thus an dev command ID would be useless)
*/
export async function runDevService({
	mode,
	devServiceSpec,
	fromConfig
}: {
	mode: 'development' | 'test'
	devServiceSpec: DevServiceSpec
	fromConfig: boolean
}): Promise<void> {
	const {
		app,
		addLogLine,
		getDevServiceData,
		setDevServiceData,
		updateDevServiceData,
		getDevServiceSpec,
		localdevConfig
	} = localdevServerStore.getState()

	setDevServiceData({
		devServiceId: devServiceSpec.id,
		devServiceData: {
			logLines: [],
			ptyProcess: null,
			spec: devServiceSpec,
			status: devServiceSpec.healthCheck === undefined ? 'unknown' : 'pending'
		}
	})

	// If we need to wait on another command, then we wait for the other command to be ready before creating the pty process
	if (devServiceSpec.dependsOn !== undefined) {
		const dependsOnSpecs = devServiceSpec.dependsOn.map((serviceId) =>
			getDevServiceSpec({ serviceId })
		)

		await Promise.all(
			dependsOnSpecs.map(async (spec) =>
				waitForDevServiceHealthy({ devServiceSpec: spec })
			)
		)
	}

	if (devServiceSpec.healthCheck !== undefined) {
		waitForDevServiceHealthy({ devServiceSpec })
			.then(() => {
				updateDevServiceData({
					devServiceId: devServiceSpec.id,
					devServiceDataUpdates: { status: 'ready' }
				})
			})
			.catch((error) => {
				console.error(error)
				updateDevServiceData({
					devServiceId: devServiceSpec.id,
					devServiceDataUpdates: { status: 'failed' }
				})
			})
	}

	const ptyProcess = spawnProcessFromDevService({
		devServiceSpec,
		mode
	})

	// TODO: handle graceful exits
	ptyProcess.onExit(({ exitCode: _exitCode }) => {
		updateDevServiceData({
			devServiceId: devServiceSpec.id,
			devServiceDataUpdates: { status: 'failed' }
		})
	})

	const emitSocketEvent = createServerSocketEventEmitter({
		socket: app.io
	})

	ptyProcess.onData((data) => {
		const logLines = splitLines(data.trim())

		const devServiceData = getDevServiceData({
			devServiceId: devServiceSpec.id
		})
		updateDevServiceData({
			devServiceId: devServiceSpec.id,
			devServiceDataUpdates: {
				logLines: [...devServiceData.logLines, ...logLines]
			}
		})

		emitSocketEvent(logsReceivedEvent, {
			devServiceId: devServiceSpec.id,
			logLines
		})

		const { logsBoxServiceId } = localdevServerStore.getState()
		const outputLog = () => {
			const logPrefixColor = getLogPrefixColor(devServiceSpec.id)
			for (const logLine of logLines) {
				addLogLine(
					`${chalk[logPrefixColor](
						getDevServiceName({ devServiceSpec })
					)}: ${logLine}`
				)
			}
		}

		// Only log the If the logs box isn't streaming the logs of a specific service ID
		if (fromConfig) {
			if (
				logsBoxServiceId === null &&
				localdevConfig.devServer.devProcessesToLog?.includes(devServiceSpec.id)
			) {
				outputLog()
			}
		} else {
			if (logsBoxServiceId === devServiceSpec.id) {
				outputLog()
			}
		}
	})

	ptyProcess.onExit(({ exitCode }) => {
		emitSocketEvent(devServiceExitedEvent, {
			devServiceId: devServiceSpec.id,
			exitCode
		})
	})

	updateDevServiceData({
		devServiceId: devServiceSpec.id,
		devServiceDataUpdates: { ptyProcess }
	})
}
