import { watch } from '@vue-reactivity/watch'
import { useEffect, useState } from 'react'
import useForceUpdate from 'use-force-update'

export function useReactiveState<T>(source: () => T) {
	const [state, setState] = useState<T>(source())
	const forceUpdate = useForceUpdate()

	useEffect(() => {
		const stopWatch = watch(
			source,
			(value) => {
				setState(value)
				forceUpdate()
			},
			{ deep: true }
		)

		return stopWatch
	}, [])

	return state
}
