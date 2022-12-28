import { Buffer } from 'node:buffer'

import { useStdin } from 'ink'
import { useCallback, useEffect } from 'react'

export function useRawInput(handler: (rawInput: Buffer) => void) {
	const { stdin } = useStdin()
	const bufferHandler = useCallback(
		(data: string | Buffer) => {
			handler(Buffer.from(data))
		},
		[handler]
	)

	useEffect(() => {
		stdin?.on('data', bufferHandler)
		return () => {
			stdin?.off('data', bufferHandler)
		}
	}, [stdin])
}
