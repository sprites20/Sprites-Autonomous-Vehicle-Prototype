import { openDB } from "idb";

const blobUrlCache = new Map();
const bufferCache = new Map();

async function getDB() {
  return openDB("avatars", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    },
  });
}

/**
 * Preload an avatar into IndexedDB + memory cache.
 * Returns a blob URL.
 */
export async function preloadAvatar(name) {
  if (blobUrlCache.has(name)) {
    return blobUrlCache.get(name);
  }

  const db = await getDB();
  let buf = await db.get("files", name);

  if (!buf) {
    const res = await fetch(`/models/${name}`);
    buf = await res.arrayBuffer();
    await db.put("files", buf, name);
    console.log(`Stored avatar ${name} in IndexedDB`);
  }

  // store in memory cache
  bufferCache.set(name, buf);

  const blob = new Blob([buf], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(name, url);

  return url;
}

/**
 * Get a blob URL synchronously from memory cache (if preloaded)
 */
export function getAvatarUrlSync(name) {
  return blobUrlCache.get(name) || null;
}

/**
 * Make a fresh unique blob URL from the cached buffer
 * Allows multiple useGLTF instances to load the same avatar separately
 */
export function makeAvatarUrl(name) {
  const buf = bufferCache.get(name);
  if (!buf) return null;

  const blob = new Blob([buf], { type: "model/gltf-binary" });
  return URL.createObjectURL(blob); // unique every call
}
