import type TypedEmitter from 'typesafe-emitter'

export interface LogLineAddedEventPayload {
	unwrappedLine: string
}

export type ProcessEmitter = TypedEmitter<{
	logLineAdded(payload: LogLineAddedEventPayload): void
	exited(exitCode: number): void
}>
