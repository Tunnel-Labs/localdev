import type TypedEmitter from 'typesafe-emitter'

export interface LogsAddedEventPayload {
	unwrappedLine: string
	wrappedLine: string[]
}

export type ProcessEmitter = TypedEmitter<{
	logsAdded(payload: LogsAddedEventPayload): void
	exited(exitCode: number): void
}>
