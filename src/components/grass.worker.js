// grass.worker.js

// --- 1. MINIMAL NOISE IMPLEMENTATION ---
// Since the worker doesn't have your main noise library, we need a 2D noise function.
// This is a simple pseudo-random noise function to make the code runnable.
// TIP: If you use a specific library like Simplex/Perlin, paste its code here.
function noise2D(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

// --- 2. YOUR MATH UTILS ---
function fbm(x, y, octaves = 5, lacunarity = 2, persistence = 0.5) {
    let freq = 1, amp = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += noise2D(x * freq, y * freq) * amp;
        norm += amp;
        freq *= lacunarity;
        amp *= persistence;
    }
    return sum / norm;
}

const biomes = {
    ocean: { noiseScale: 0.5, heightScale: 2 },
    // Include your other biomes here so the worker knows them
};

function getBlendedBiomes(e, t, h) {
    // Paste your actual getBlendedBiomes logic here
    return [{ biome: biomes.ocean, weight: 1 }]; 
}

// --- 3. YOUR HEIGHT FUNCTION ---
const calculateHeightAt = (worldX, worldZ, settings) => {
    const {
        baseElevationScale = 0.0001, tempBiomeScale = 0.0002,
        humBiomeScale = 0.00025, terrainBaseFreq = 0.001,
        mountainRangeFreq = 0.0001, mountainRangeIntensity = 0.7,
        mountainRangeOctaves = 13, mountainRangePersistence = 0.45,
        baseTerrainOffset = -9
    } = settings;

    const elevationNoise = fbm(worldX * baseElevationScale, worldZ * baseElevationScale, 5, 2, 0.6);
    const tempNoiseVal = fbm(worldX * tempBiomeScale, worldZ * tempBiomeScale, 4, 2, 0.6);
    const humNoiseVal = fbm(worldX * humBiomeScale, worldZ * humBiomeScale, 4, 2, 0.6);

    let influencingBiomes;
    if (elevationNoise < -0.1) {
        influencingBiomes = [{ biome: biomes.ocean, weight: 1 }];
    } else {
        influencingBiomes = getBlendedBiomes(elevationNoise, tempNoiseVal, humNoiseVal);
    }

    let blendedHeight = 0;
    influencingBiomes.forEach(({ biome, weight }) => {
        const freq = terrainBaseFreq * biome.noiseScale;
        const localTerrainHeightNoise = fbm(worldX * freq, worldZ * freq, 5);
        let biomeHeight = (elevationNoise + 1) / 2 * (biome.heightScale * 0.7);
        biomeHeight += localTerrainHeightNoise * biome.heightScale;

        const mountainRangeNoise = fbm(worldX * mountainRangeFreq, worldZ * mountainRangeFreq, mountainRangeOctaves, 2.5, mountainRangePersistence);
        const mountainThreshold = 0.05;
        if (mountainRangeNoise > mountainThreshold) {
            biomeHeight += (mountainRangeNoise - mountainThreshold) / (1 - mountainThreshold) * mountainRangeIntensity * 200;
        }
        blendedHeight += biomeHeight * weight;
    });

    return blendedHeight + baseTerrainOffset;
};

// --- 4. THE EXECUTION LOOP ---
self.onmessage = function(e) {
    const { grassCount, chunkSize, chunkX, chunkZ, settings } = e.data;
    
    // Using a Float32Array is essential for performance
    const positions = new Float32Array(grassCount * 3);
    let validCount = 0;

    for (let i = 0; i < grassCount; i++) {
        // Random placement within chunk
        const lx = Math.random() * chunkSize;
        const lz = Math.random() * chunkSize;
        const gWorldX = lx + chunkX * chunkSize;
        const gWorldZ = lz + chunkZ * chunkSize;

        const height = calculateHeightAt(gWorldX, gWorldZ, settings);

        // Filter: Only spawn grass if above water/offset level
        if (height > settings.baseTerrainOffset + 0.5) {
            const idx = validCount * 3;
            positions[idx] = gWorldX;
            positions[idx + 1] = height;
            positions[idx + 2] = gWorldZ;
            validCount++;
        }
    }

    // Slice to the actual number of valid grass blades found
    const finalBuffer = positions.slice(0, validCount * 3);

    // Post back to main thread using Transferable Objects
    self.postMessage({
        positions: finalBuffer,
        chunkKey: `${chunkX}-${chunkZ}`
    }, [finalBuffer.buffer]);
};