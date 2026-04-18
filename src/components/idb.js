// idb.js
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fbx-cache", 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("files");
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getFile(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const req = store.get(key);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFile(key, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    const req = store.put(blob, key);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
