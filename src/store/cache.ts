import { clear, createStore, getMany, setMany } from 'idb-keyval';

// Dedicated store so this never collides with other IndexedDB usage on the
// page. Works from both the main thread and workers (indexedDB is global
// in both contexts).
const mosaicStore = createStore('mosaic-builder', 'cache');

export function cacheKey(name: string, size: number, lastModified: number): string {
  return `${name}:${size}:${lastModified}`;
}

export interface CachedFeatures {
  features: number[];
}

/** Batched lookup: one IndexedDB transaction for the whole list of keys. */
export async function getManyCached(keys: string[]): Promise<(CachedFeatures | undefined)[]> {
  return getMany<CachedFeatures | undefined>(keys, mosaicStore);
}

/** Batched write: one IndexedDB transaction for the whole list of entries. */
export async function setManyCached(entries: [string, CachedFeatures][]): Promise<void> {
  if (entries.length === 0) return;
  return setMany(entries, mosaicStore);
}

export async function clearCache(): Promise<void> {
  return clear(mosaicStore);
}
