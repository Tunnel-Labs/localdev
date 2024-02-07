/**
	This code is based on `caitp/node-mock-stdin`

	@see https://github.com/caitp/node-mock-stdin/blob/dev/lib/mock/stdin.js
*/
import { Buffer } from 'node:buffer';
import { ReadStream } from 'node:tty';

import invariant from 'tiny-invariant';

class MockData {
	data: Buffer | string | null;
	encoding: BufferEncoding | undefined;
	pos = 0;
	done = false;

	get length() {
		if (Buffer.isBuffer(this.data)) {
			return this.data.length;
		} else if (typeof this.data === 'string') {
			return this.data.length;
		}

		return 0;
	}

	constructor(chunk: null | Buffer | string, encoding?: BufferEncoding) {
		this.data = chunk;
		this.encoding = encoding;
	}

	chunk(length: number) {
		if (
			this.pos <= this.length &&
			(Buffer.isBuffer(this.data) || typeof this.data === 'string')
		) {
			const value = this.data.slice(this.pos, this.pos + length);
			this.pos += length;
			if (this.pos >= this.length) {
				this.done = true;
			}

			return value;
		}

		this.done = true;
		return null;
	}
}

export class MockStdin extends ReadStream {
	isMock = true;
	_mockData: MockData[] = [];
	_flags: { emittedData: boolean; lastChunk: string | Buffer | null } = {
		emittedData: false,
		lastChunk: null,
	};

	constructor() {
		super(0);
	}

	emit(name: string, ...args: any) {
		if (name === 'data') {
			this._flags.emittedData = true;
			this._flags.lastChunk = null;
		}

		return super.emit(name, ...args);
	}

	send(text: string | string[] | Buffer | null, encoding?: BufferEncoding) {
		if (Array.isArray(text)) {
			if (encoding !== undefined) {
				throw new TypeError(
					'Cannot invoke MockStdin#send(): `encoding` ' +
						'specified while text specified as an array.',
				);
			}

			text = text.join('\n');
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (Buffer.isBuffer(text) || typeof text === 'string' || text === null) {
			const data = new MockData(text, encoding);
			this._mockData.push(data);
			this._read();
			// @ts-expect-error: Node internals
			if (!this._flags.emittedData && this._readableState.length > 0) {
				this.#drainData();
			}

			if (text === null) {
				// Trigger an end event synchronously...
				this.#endReadable();
			}
		}
	}

	reset(removeListeners?: boolean) {
		// @ts-expect-error: Node internals
		const state = this._readableState;
		state.ended = false;
		state.endEmitted = false;
		if (removeListeners === true) {
			this.removeAllListeners();
		}

		return this;
	}

	_read(size?: number) {
		if (size === undefined) size = Number.POSITIVE_INFINITY;
		let count = 0;
		let read = true;
		while (read && this._mockData.length > 0 && count < size) {
			const item = this._mockData[0];
			invariant(item !== undefined, 'item is not undefined');
			const leftInChunk = item.length - item.pos;
			const remaining = size === Number.POSITIVE_INFINITY ?
				leftInChunk :
				size - count;
			const { encoding } = item;
			const toProcess = Math.min(leftInChunk, remaining);
			const chunk = item.chunk(toProcess);
			this._flags.lastChunk = chunk;

			if (
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- check for null was used in the original code
				!(encoding === undefined || encoding === null ?
					this.push(chunk) :
					this.push(chunk, encoding))
			) {
				read = false;
			}

			if (item.done) {
				this._mockData.shift();
			}

			count += toProcess;
		}
	}

	end() {
		this.send(null);
		return this;
	}

	#drainData() {
		// @ts-expect-error: Node internals
		const state = this._readableState;
		const { buffer } = state;
		while (buffer.length > 0) {
			const chunk = buffer.shift();
			if (chunk !== null) {
				state.length -= chunk.length;
				this.emit('data', chunk);
				this._flags.emittedData = false;
			}
		}
	}

	/**
		Synchronously emit an end event, if possible.
	*/
	#endReadable() {
		// @ts-expect-error: Node internals
		const state = this._readableState;

		if (state.length === 0) {
			state.ended = true;
			state.endEmitted = true;
			this.readable = false;
			this.emit('end');
		}
	}
}
