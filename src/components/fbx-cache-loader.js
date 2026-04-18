// fbx-cache-loader.js
import { getFile, saveFile } from "./idb";

export async function loadFBXWithCache(url) {
  // 1. Check if stored in IDB
  const cached = await getFile(url);

  if (cached) {
    console.log("Loaded from IDB:", url);
    return URL.createObjectURL(cached);
  }

  // 2. Download if missing
  const res = await fetch(url);
  const blob = await res.blob();

  // 3. Save to IDB
  await saveFile(url, blob);

  console.log("Downloaded & saved to IDB:", url);
  return URL.createObjectURL(blob);
}

export async function loadTextureFileWithCache(url) {
    // 1. Check if stored in IDB
    const cached = await getFile(url);

    if (cached) {
        console.log(`Loaded from IDB: ${url}`);
        return cached; // Return the Blob directly
    }

    // 2. Download if missing
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch texture: ${url}`);
    
    // We need the array buffer for Three.js's ImageLoader/TextureLoader when loading locally
    // For this specific case, let's keep it simple and just save the Blob.
    const blob = await res.blob(); 

    // 3. Save to IDB
    await saveFile(url, blob);

    console.log(`Downloaded & saved to IDB: ${url}`);
    return blob; // Return the Blob
}