import { clear, createStore, getMany, setMany } from 'idb-keyval';

// Dedicated store so this never collides with other IndexedDB usage on the
// page. Works from both the main thread and workers (indexedDB is global in
// both contexts). The version in the name retires entries without thumbnails.
const DB_NAME = 'mosaic-builder-v3';
const mosaicStore = createStore(DB_NAME, 'cache');

export function cacheKey(name: string, size: number, lastModified: number): string {
  return `${name}:${size}:${lastModified}`;
}

export interface CachedPhoto {
  features: Float32Array;
  thumb: Blob;
}

// Stored as raw bytes: WebKit can refuse Blobs in IndexedDB, and rejects with null when it does.
interface StoredPhoto {
  features: Float32Array;
  thumbBytes: ArrayBuffer;
}

/** Batched lookup: one IndexedDB transaction for the whole list of keys. */
export async function getManyCached(keys: string[]): Promise<(CachedPhoto | undefined)[]> {
  const stored = await getMany<StoredPhoto | undefined>(keys, mosaicStore);
  return stored.map((entry) =>
    entry ? { features: entry.features, thumb: new Blob([entry.thumbBytes], { type: 'image/jpeg' }) } : undefined,
  );
}

/** Batched write: one IndexedDB transaction for the whole list of entries. */
export async function setManyCached(entries: [string, CachedPhoto][]): Promise<void> {
  if (entries.length === 0) return;
  const stored = await Promise.all(
    entries.map(
      async ([key, photo]): Promise<[string, StoredPhoto]> => [key, { features: photo.features, thumbBytes: await photo.thumb.arrayBuffer() }],
    ),
  );
  return setMany(stored, mosaicStore);
}

export async function clearCache(): Promise<void> {
  return clear(mosaicStore);
}

/** Removes the pre-thumbnail database left by older versions of the app. */
export function deleteLegacyCache(): void {
  for (const name of ['mosaic-builder', 'mosaic-builder-v2']) indexedDB.deleteDatabase(name);
}
