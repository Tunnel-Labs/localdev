import type { StoreApi } from 'zustand'

export type InferStoreType<S> = S extends StoreApi<infer R> ? R : unknown
