import type TypedEmitter from 'typesafe-emitter';
import { type UnwrappedLogLineData } from '../types/logs.js';

export type ProcessEmitter = TypedEmitter<{
	logsAdded(logLineData: UnwrappedLogLineData): void;
	exited(exitCode: number): void;
}>;
