import type TypedEmitter from 'typesafe-emitter'

export interface LogsAddedPayload {
	data: string
}

export type ProcessEmitter = TypedEmitter<{
	logsAdded(payload: LogsAddedPayload): void
	exited(exitCode: number): void
}>
