import { markRaw as _markRaw } from '@vue/reactivity'

export type Raw<T> = T &
	// eslint-disable-next-line @typescript-eslint/ban-types -- We need an empty object here
	Required<ReturnType<typeof _markRaw<{}>>>
export const markRaw: <T>(t: T) => Raw<T> =
	_markRaw as any
