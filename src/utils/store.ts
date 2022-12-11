import type { StoreApi, UseBoundStore } from 'zustand'

type WithSelectors<S> = S extends { getState: () => infer T }
	? S & { use: { [K in keyof T]: () => T[K] } }
	: never

export const createSelectors = <S extends UseBoundStore<StoreApi<unknown>>>(
	_store: S
) => {
	const store = _store as WithSelectors<typeof _store>
	store.use = {}
	for (const k of Object.keys(store.getState() as any)) {
		;(store.use as any)[k] = () => store((s) => (s as any)[k as keyof typeof s])
	}

	return store
}
