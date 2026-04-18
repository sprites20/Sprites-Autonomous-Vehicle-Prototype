// chunkWorker.js
// This worker will calculate which chunks should be rendered and which should have physics enabled.

let currentChunks = new Map(); // Store the currently active chunks

onmessage = function(e) {
    const { camX, camZ, renderDistance, physicsActiveDistance, chunkSize, chunkResolution } = e.data;

    const newChunksToRender = [];
    const newChunkMap = new Map(); // To build the new set of active chunks

    // Convert renderDistance and physicsActiveDistance from world units to chunk units
    const renderChunkRadius = Math.ceil(renderDistance / chunkSize);
    const physicsChunkRadius = Math.ceil(physicsActiveDistance / chunkSize);

    // Get the chunk coordinates of the camera
    const camChunkX = Math.floor(camX / chunkSize);
    const camChunkY = Math.floor(camZ / chunkSize); // Assuming Z is your 'Y' in 2D grid

    for (let i = -renderChunkRadius; i <= renderChunkRadius; i++) {
        for (let j = -renderChunkRadius; j <= renderChunkRadius; j++) {
            const chunkX = camChunkX + i;
            const chunkY = camChunkY + j;

            // Calculate distance from camera to the center of the chunk
            const chunkCenterX = chunkX * chunkSize + chunkSize / 2;
            const chunkCenterY = chunkY * chunkSize + chunkSize / 2; // Z in world coords

            const distanceToChunk = Math.sqrt(
                Math.pow(chunkCenterX - camX, 2) +
                Math.pow(chunkCenterY - camZ, 2)
            );

            // Determine if the chunk should be rendered
            if (distanceToChunk <= renderDistance) {
                const enablePhysics = distanceToChunk <= physicsActiveDistance;
                const chunkKey = `${chunkX},${chunkY}`;

                const chunkData = {
                    chunkX: chunkX,
                    chunkY: chunkY,
                    enablePhysics: enablePhysics,
                    // Potentially add other chunk-specific data here if needed,
                    // e.g., seed for terrain generation, etc.
                };

                newChunksToRender.push(chunkData);
                newChunkMap.set(chunkKey, chunkData);
            }
        }
    }

    // Only send updates if the set of chunks has changed or their physics status has changed
    let shouldUpdate = false;
    if (newChunkMap.size !== currentChunks.size) {
        shouldUpdate = true;
    } else {
        for (const [key, value] of newChunkMap.entries()) {
            const existingValue = currentChunks.get(key);
            if (!existingValue || existingValue.enablePhysics !== value.enablePhysics) {
                shouldUpdate = true;
                break;
            }
        }
    }

    if (shouldUpdate) {
        currentChunks = newChunkMap; // Update the worker's internal state
        postMessage(newChunksToRender);
    }
};