import { get, set, clear, createStore } from 'idb-keyval';

// Dedicated store so this never collides with other IndexedDB usage on the
// page. Full thumb/feature caching lands in M3; this is the plumbing.
const mosaicStore = createStore('mosaic-builder', 'cache');

export function cacheKey(name: string, size: number, lastModified: number): string {
  return `${name}:${size}:${lastModified}`;
}

export async function getCached<T>(key: string): Promise<T | undefined> {
  return get<T>(key, mosaicStore);
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  return set(key, value, mosaicStore);
}

export async function clearCache(): Promise<void> {
  return clear(mosaicStore);
}
