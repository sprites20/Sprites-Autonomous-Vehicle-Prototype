import React, { useMemo, useRef, useState, useEffect } from 'react';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { Object3D, Vector3, Color, DoubleSide, Matrix4, BufferGeometry, BufferAttribute } from 'three';
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'
import noise2D from './noise.js'; // Assuming this provides a value between -1 and 1
import { getEdits } from './TerrainEdits'; // Import our new edit store
import GenshinTree from './GenshinTree.jsx';
// --- Utility Functions ---

// Fractal Brownian Motion for layered terrain detail
function fbm(x, y, octaves = 5, lacunarity = 2, persistence = 0.5) {
  let freq = 1, amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2D(x * freq, y * freq) * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= persistence;
  }
  return sum / norm; // Output typically between -1 and 1
}

function smoothstep(edge0, edge1, x) {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

// Simple linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

// Function to get a random scale vector (for rocks/trees)
function getRandomScale(min, max) {
    const scaleX = getRandomArbitrary(min[0], max[0]);
    const scaleY = getRandomArbitrary(min[1], max[1]);
    const scaleZ = getRandomArbitrary(min[2], max[2]);
    return new Vector3(scaleX, scaleY, scaleZ);
}

// --- Core Height Calculation Function ---
const calculateHeightAt = (worldX, worldZ, settings = {}) => {
  const {
    baseElevationScale = 0.0001,
    tempBiomeScale = 0.0002,
    humBiomeScale = 0.00025,
    terrainBaseFreq = 0.001,
    mountainRangeFreq = 0.0001,
    mountainRangeIntensity = 0.7,
    mountainRangeOctaves = 13,
    mountainRangePersistence = 0.45,
    baseTerrainOffset = -9
  } = settings;

  // 1. Get Noise Values
  const elevationNoise = fbm(worldX * baseElevationScale, worldZ * baseElevationScale, 5, 2, 0.6);
  const tempNoiseVal = fbm(worldX * tempBiomeScale, worldZ * tempBiomeScale, 4, 2, 0.6);
  const humNoiseVal = fbm(worldX * humBiomeScale, worldZ * humBiomeScale, 4, 2, 0.6);

  // 2. Determine Biomes
  let influencingBiomes;
  if (elevationNoise < -0.1) {
    influencingBiomes = [{ biome: biomes.ocean, weight: 1 }];
  } else {
    influencingBiomes = getBlendedBiomes(elevationNoise, tempNoiseVal, humNoiseVal);
  }

  // 3. Calculate Blended Height
  let blendedHeight = 0;
  influencingBiomes.forEach(({ biome, weight }) => {
    const freq = terrainBaseFreq * biome.noiseScale;
    const localTerrainHeightNoise = fbm(worldX * freq, worldZ * freq, 5);
    
    let biomeHeight = (elevationNoise + 1) / 2 * (biome.heightScale * 0.7);
    biomeHeight += localTerrainHeightNoise * biome.heightScale;

    // Mountain Influence
    const mountainRangeNoise = fbm(worldX * mountainRangeFreq, worldZ * mountainRangeFreq, mountainRangeOctaves, 2.5, mountainRangePersistence);
    const mountainThreshold = 0.05;
    if (mountainRangeNoise > mountainThreshold) {
      biomeHeight += (mountainRangeNoise - mountainThreshold) / (1 - mountainThreshold) * mountainRangeIntensity * 200;
    }

    blendedHeight += biomeHeight * weight;
  });

  return blendedHeight + baseTerrainOffset;
};

// --- Biome Data (Abbreviated for brevity, consistent with context) ---

const biomes = {
  ocean: { targetElevation: -3, targetTemp: 0.0, targetHum: 0.8, noiseScale: 0.8, heightScale: 80, minHeight: -500, maxHeight: -50, colors: [{ threshold: 0.2, color1: "#F5DEB3", color2: "#E0C9A6" }] },
  beach: { targetElevation: -1, targetTemp: 0.3, targetHum: 0.6, noiseScale: 0.9, heightScale: 3, minHeight: -50, maxHeight: -3, colors: [{ threshold: 0.5, color1: "#F5DEB3", color2: "#E0C9A6" }] },
  grassland: { targetElevation: 0.2, targetTemp: 0.4, targetHum: 0.5, noiseScale: 1.0, heightScale: 15, minHeight: 0.5, maxHeight: 15, colors: [{ threshold: 0.1, color1: "#FAD689", color2: "#F0E68C" }, { threshold: 0.7, color1: "#88CC55", color2: "#228B22" }] },
  desert: { targetElevation: 0.1, targetTemp: 0.9, targetHum: -0.8, noiseScale: 1.1, heightScale: 15, minHeight: 0, maxHeight: 20, colors: [{ threshold: 0.3, color1: "#FAD689", color2: "#E7C475" }] },
  rainforest: { targetElevation: 0.3, targetTemp: 0.7, targetHum: 0.9, noiseScale: 0.9, heightScale: 18, minHeight: 5, maxHeight: 30, colors: [{ threshold: 0.4, color1: "#0A6640", color2: "#1E8449" }] },
  tundra: { targetElevation: 0.4, targetTemp: -0.9, targetHum: 0.4, noiseScale: 1.0, heightScale: 10, minHeight: 10, maxHeight: 25, colors: [{ threshold: 0.5, color1: "#DDEEFF", color2: "#BECEDB" }] },
  savanna: { targetElevation: 0.2, targetTemp: 0.7, targetHum: 0.2, noiseScale: 1.0, heightScale: 12, minHeight: 0, maxHeight: 18, colors: [{ threshold: 0.4, color1: "#C2B280", color2: "#A0935D" }] },
  swamp: { targetElevation: -0.2, targetTemp: 0.3, targetHum: 0.9, noiseScale: 0.8, heightScale: 5, minHeight: -5, maxHeight: 5, colors: [{ threshold: 0.3, color1: "#3A5F0B", color2: "#556B2F" }] },
  mountain: { targetElevation: 0.6, targetTemp: 0.0, targetHum: 0.3, noiseScale: 1.2, heightScale: 50, minHeight: 30, maxHeight: 1000, colors: [{ threshold: 0.4, color1: "#228B22", color2: "#888888" }, { threshold: 0.7, color1: "#888888", color2: "#AAAAAA" }] },
  alpine: { targetElevation: 0.8, targetTemp: -0.7, targetHum: 0.2, noiseScale: 1.3, heightScale: 60, minHeight: 50, maxHeight: 100, colors: [{ threshold: 0.3, color1: "#AAAAAA", color2: "#CCCCCC" }] },
  volcanic: { targetElevation: 0.5, targetTemp: 0.8, targetHum: -0.5, noiseScale: 1.5, heightScale: 40, minHeight: 20, maxHeight: 60, colors: [{ threshold: 0.4, color1: "#333333", color2: "#550000" }] },
};


// --- Biome Blending Logic (Unchanged) ---

function getBlendedBiomes(elevationNoise, tempNoise, humNoise) {
  const allBiomes = Object.keys(biomes).map(key => ({ name: key, ...biomes[key] }));

  const biomeDistances = allBiomes.map(biome => {
    const dist = Math.hypot(
      elevationNoise - biome.targetElevation,
      tempNoise - biome.targetTemp,
      humNoise - biome.targetHum
    );
    return { biome, dist };
  });

  biomeDistances.sort((a, b) => a.dist - b.dist);

  const closestBiomes = biomeDistances.slice(0, 4);

  const maxInfluenceDist = 0.8;
  const biomeInfluences = closestBiomes.map(({ biome, dist }) => {
    const weight = 1 - smoothstep(0, maxInfluenceDist, dist);
    return { biome, weight };
  });

  const totalWeight = biomeInfluences.reduce((sum, { weight }) => sum + weight, 0);

  if (totalWeight === 0) {
    return [{ biome: biomeDistances[0].biome, weight: 1 }];
  }

  return biomeInfluences.map(({ biome, weight }) => ({
    biome,
    weight: weight / totalWeight,
  }));
}

// --- Asset Configuration ---

// Trees
const TREE_SPAWN_CHANCE = 0.15;
const MIN_TREE_SPACING = 10; 
const treeAssets = {
    broadleaf: { color: 'green', trunkColor: '#6B4D36', minScale: [0.5, 6, 0.5], maxScale: [1, 10, 1] },
    conifer: { color: 'darkgreen', trunkColor: '#8B4513', minScale: [0.4, 8, 0.4], maxScale: [0.8, 12, 0.8] },
    //cactus: { color: 'lime', trunkColor: 'darkgreen', minScale: [0.3, 2, 0.3], maxScale: [0.6, 4, 0.6] },
};

const treeTemplates = {
    broadleaf: { shape: 'round', leafColors: ['#2d4c1e', '#3f6212', '#4d7c0f'], trunkColor: '#3b2a1e', height: 10*.4, trunkHeight: 6*.5, recursion: 4 },
    conifer: { shape: 'pine', leafColors: ['#064e3b', '#065f46', '#022c22'], trunkColor: '#1a1a1a', height: 32*.4, trunkHeight: 8*.5 },
    sakura: { shape: 'round', leafColors: ['#ffd1dc','#ffb3c6','#ffc0cb'], trunkColor: '#3b2f2f', height: 9*0.4, trunkHeight: 6*0.5, recursion: 4 },
    cactus: { shape: 'round', leafColors: ['#4ade80', '#22c55e', '#16a34a'], trunkColor: '#14532d', height: 6*.4, trunkHeight: 4*.5, recursion: 3 }
};

// Rocks and Minerals
const ROCK_SPAWN_CHANCE = 0.05;
const MINERAL_VEIN_NOISE_SCALE = 0.001; // Increased scale for more distributed minerals
const MINERAL_VEIN_THRESHOLD = 0.5; // Lowered threshold for more common minerals (was 0.75)
const MIN_ROCK_TREE_SPACING = 5; // New check for rock-tree separation

const rockAssets = {
    pebble: { color: '#696969', minScale: [0.3, 0.3, 0.3], maxScale: [0.8, 0.8, 0.8] },
    boulder: { color: '#888888', minScale: [1, 1, 1], maxScale: [2.5, 2.5, 2.5] },
};

const ROCKS_COMMON_BIOMES = ['mountain', 'alpine', 'desert', 'tundra'];

const mineralAssets = {
    iron: { color: '#C56248', metalness: 0.9, roughness: 0.3, biomes: ['mountain', 'volcanic', 'tundra'] },
    copper: { color: '#B87333', metalness: 0.8, roughness: 0.4, biomes: ['mountain', 'alpine', 'desert'] },
    coal: { color: '#36454F', metalness: 0.1, roughness: 0.8, biomes: ['grassland', 'swamp', 'rainforest'] },
    gold: { color: '#FFD700', metalness: 1.0, roughness: 0.1, biomes: ['alpine', 'desert'] },
};
const MINERAL_COMMON_BIOMES = Object.values(mineralAssets).flatMap(m => m.biomes);

// Villages
const VILLAGE_NOISE_SCALE = 0.00005; 
const VILLAGE_NOISE_THRESHOLD = 0.85; 
const MIN_VILLAGE_FLATNESS_RADIUS = 30;
const VILLAGE_PREFERRED_BIOMES = ['grassland', 'savanna', 'beach']; 

const buildingAssets = {
    house: { color: '#A0522D', scale: [8, 6, 8] },
    tower: { color: '#778899', scale: [5, 12, 5] },
};

// Global array to store successful village centers (to avoid overlap across chunks)
// In a true implementation, this should be a global state/ref managed outside the chunk component.
const existingVillageCenters = []; 

const GrassMaterial = shaderMaterial(
  {
    uTime: 0,
    uWindSpeed: 1.2,
    uWindStrength: 0.3,
    uColor: new Color("#4ade80"), // Base "Genshin" Green
    uTipColor: new Color("#bbf7d0"), // Lighter tip
  },
  // Vertex Shader
  `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;

  void main() {
    vUv = uv;
    
    // Get instance world position
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    
    // Multi-layered wind math
    // uv.y ensures the bottom of the grass stays stuck to the ground
    float wind = sin(uTime * uWindSpeed + worldPosition.x * 0.5 + worldPosition.z * 0.5);
    wind += sin(uTime * uWindSpeed * 2.0 + worldPosition.x * 0.2) * 0.5; // Micro-sway
    
    float finalWind = wind * uWindStrength * uv.y;
    
    worldPosition.x += finalWind;
    worldPosition.z += finalWind * 0.5;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
  `,
  // Fragment Shader
  `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform vec3 uTipColor;

  void main() {
    // 1. Stylized Gradient
    // We use pow() to make the transition from dark to light happen near the top
    float strength = pow(vUv.y, 1.5);
    vec3 baseColor = vec3(0.05, 0.15, 0.05); // Very dark green base
    vec3 mixedColor = mix(baseColor, uColor, vUv.y);
    vec3 finalColor = mix(mixedColor, uTipColor, strength);

    // 2. Simple "Fake" SSS (Subsurface Scattering)
    // Makes the tips look like they are catching sunlight
    float tipGlow = smoothstep(0.7, 1.0, vUv.y) * 0.2;
    finalColor += tipGlow;

    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
);

extend({ GrassMaterial });
const Grass = ({ positions }) => {
  const meshRef = useRef();
  const materialRef = useRef();

  // Create a literal Triangle (3 vertices)
  const triangleGeometry = useMemo(() => {
    const geo = new BufferGeometry();
    const w = 0.1; // Width of the base
    const h = 0.4;  // Height of the blade
    
    const vertices = new Float32Array([
      -w / 2, 0, 0,  // bottom left
       w / 2, 0, 0,  // bottom right
       0, h, 0       // top tip
    ]);

    const uvs = new Float32Array([
      0, 0, 
      1, 0, 
      0.5, 1
    ]);

    geo.setAttribute('position', new BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    return geo;
  }, []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
    }
  });

  useEffect(() => {
    const tempObject = new Object3D();
    
    positions.forEach((pos, i) => {
      tempObject.position.set(pos.x, pos.y, pos.z);
      
      // Randomize scale for organic look
      const s = 0.6 + Math.random() * 0.6;
      tempObject.scale.set(s, s, s);
      
      // Random rotation so they don't look like a grid
      tempObject.rotation.y = Math.random() * Math.PI;
      
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    
    // Optimization for 1660 Ti: Large Bounding Box to prevent flickering
    meshRef.current.geometry.computeBoundingSphere();
  }, [positions]);

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[triangleGeometry, null, positions.length]} 
      frustumCulled={false} // Prevents "vanishing" at screen edges
      renderOrder={5}       // Ensures it renders after Terrain (0)
    >
      <grassMaterial 
        ref={materialRef} 
        side={DoubleSide} 
        transparent={false}  // Keep Opaque + discard for performance
        alphaTest={0.5} 
        depthWrite={true}
      />
    </instancedMesh>
  );
};

export default Grass;

export const ProceduralChunk = ({
  chunkSize = 16,
  resolution = 8,
  chunkX = 0,
  chunkY = 0,
  baseElevationScale = 0.0001,
  tempBiomeScale = 0.0002,
  humBiomeScale = 0.00025,
  terrainBaseFreq = 0.001,
  mountainRangeFreq = 0.0001,
  mountainRangeIntensity = 0.7,
  mountainRangeOctaves = 13,
  mountainRangePersistence = 0.45,
  baseTerrainOffset = -9,
  forceEnablePhysics = false,
  editTrigger,
}) => {
  const { vertices, indices, normals, colors, treePositions, rockPositions, villagePositions, grassPositions } = useMemo(() => {
    const positions = [];
    const indices = [];
    const tempNormals = [];
    const vertexColors = [];
    const treePositions = [];
    const existingTreePositions = []; // For spacing check
    const rockPositions = []; 
    const villagePositions = []; // For village buildings
    const grassPositions = []; // For grass
    const grassCount = 700;

    const segment = chunkSize / resolution;

    // Get the latest edits from the global store
    const { burrows, flattens, adds } = getEdits();
    
    // --- Village Generation Logic (Run Once Per Chunk) ---
    const centerX = (resolution / 2) * segment + chunkX * chunkSize;
    const centerZ = (resolution / 2) * segment + chunkY * chunkSize;

    const villageNoise = fbm(centerX * VILLAGE_NOISE_SCALE, centerZ * VILLAGE_NOISE_SCALE, 3);

    if (villageNoise > VILLAGE_NOISE_THRESHOLD) {
        
        // 1. Check Biome Suitability (using the center point's biome data)
        const centerElevation = fbm(centerX * baseElevationScale, centerZ * baseElevationScale, 5, 2, 0.6);
        const centerTemp = fbm(centerX * tempBiomeScale, centerZ * tempBiomeScale, 4, 2, 0.6);
        const centerHum = fbm(centerX * humBiomeScale, centerZ * humBiomeScale, 4, 2, 0.6);
        const centerBiomes = getBlendedBiomes(centerElevation, centerTemp, centerHum);
        const mainBiomeName = centerBiomes.length > 0 ? centerBiomes[0].biome.name : null;

        if (mainBiomeName && VILLAGE_PREFERRED_BIOMES.includes(mainBiomeName)) {
            
            // 2. Check for Proximity to other Villages 
            const isTooCloseToOtherVillage = existingVillageCenters.some(
                pos => pos.distanceTo(new Vector3(centerX, 0, centerZ)) < MIN_VILLAGE_FLATNESS_RADIUS * 2
            );

            if (!isTooCloseToOtherVillage) {
                
                // --- Success: Spawn Village Buildings ---
                existingVillageCenters.push(new Vector3(centerX, 0, centerZ));

                const numBuildings = Math.floor(getRandomArbitrary(3, 6));

                for (let i = 0; i < numBuildings; i++) {
                    const angle = getRandomArbitrary(0, Math.PI * 2);
                    const distance = getRandomArbitrary(15, 25);
                    
                    const buildingX = centerX + Math.cos(angle) * distance;
                    const buildingZ = centerZ + Math.sin(angle) * distance;
                    
                    // Simplified height calculation at building position
                    const buildingElevation = fbm(buildingX * baseElevationScale, buildingZ * baseElevationScale, 5, 2, 0.6);
                    const buildingHeightNoise = fbm(buildingX * terrainBaseFreq, buildingZ * terrainBaseFreq, 5);
                    
                    let finalHeight = (buildingElevation + 1) / 2 * (biomes[mainBiomeName].heightScale * 0.7);
                    finalHeight += buildingHeightNoise * biomes[mainBiomeName].heightScale;
                    finalHeight += baseTerrainOffset; 

                    const assetKeys = Object.keys(buildingAssets);
                    const assetKey = assetKeys[Math.floor(Math.random() * assetKeys.length)];
                    const asset = buildingAssets[assetKey];
                    
                    const scaleX = asset.scale[0] * getRandomArbitrary(0.8, 1.2);
                    const scaleY = asset.scale[1] * getRandomArbitrary(0.8, 1.2);
                    const scaleZ = asset.scale[2] * getRandomArbitrary(0.8, 1.2);

                    villagePositions.push({
                        id: `village_${chunkX}_${chunkY}_${i}`,
                        position: new Vector3(buildingX, finalHeight + scaleY / 2, buildingZ),
                        scale: new Vector3(scaleX, scaleY, scaleZ),
                        color: asset.color,
                    });
                }
            }
        }
    }
    // -------------------------------------------------------------------


    for (let iy = 0; iy <= resolution; iy++) {
      for (let ix = 0; ix <= resolution; ix++) {
        const worldX = ix * segment + chunkX * chunkSize;
        const worldZ = iy * segment + chunkY * chunkSize;

        // --- 1. Biome & Height Calculation ---

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
        let blendedColor = new Color(0, 0, 0);

        influencingBiomes.forEach(({ biome, weight }) => {
          const freq = terrainBaseFreq * biome.noiseScale;
          const localTerrainHeightNoise = fbm(worldX * freq, worldZ * freq, 5);
          let biomeHeight = (elevationNoise + 1) / 2 * (biome.heightScale * 0.7);
          biomeHeight += localTerrainHeightNoise * biome.heightScale;

          const mountainRangeNoise = fbm(worldX * mountainRangeFreq, worldZ * mountainRangeFreq, mountainRangeOctaves, 2.5, mountainRangePersistence);
          const mountainInfluenceThreshold = 0.05;
          if (mountainRangeNoise > mountainInfluenceThreshold) {
            biomeHeight += (mountainRangeNoise - mountainInfluenceThreshold) / (1 - mountainInfluenceThreshold) * mountainRangeIntensity * 200;
          }

          blendedHeight += biomeHeight * weight;

          // Color calculation logic (simplified)
          const normalizedHeightForColor = Math.min(1, Math.max(0, (blendedHeight - biome.minHeight) / (biome.maxHeight - biome.minHeight)));
          const colorFromBiome = (normalizedValue, biomeData) => {
            const c = new Color();
            let foundRange = false;
            for (let i = 0; i < biomeData.colors.length; i++) {
              const { threshold, color1, color2 } = biomeData.colors[i];
              const prevThreshold = i === 0 ? 0 : biomeData.colors[i - 1].threshold;
              if (normalizedValue < threshold) {
                const t = (normalizedValue - prevThreshold) / (threshold - prevThreshold);
                c.lerpColors(new Color(color1), new Color(color2), t);
                foundRange = true;
                break;
              }
            }
            if (!foundRange && biomeData.colors.length > 0) {
              const lastColorDef = biomeData.colors[biomeData.colors.length - 1];
              c.set(lastColorDef.color2 || lastColorDef.color1);
            }
            return c;
          };

          const colorComponent = colorFromBiome(normalizedHeightForColor, biome);
          blendedColor.r += colorComponent.r * weight;
          blendedColor.g += colorComponent.g * weight;
          blendedColor.b += colorComponent.b * weight;
        });

        blendedHeight += baseTerrainOffset;

        // --- 2. Apply Terrain Edits (Flatten, Burrow, Add) ---

        const currentVertexPosition = new Vector3(worldX, blendedHeight, worldZ);

        // ... (Edit application logic unchanged) ...
        flattens.forEach(flatten => {
          const dist = currentVertexPosition.distanceTo(flatten.position);
          if (dist < flatten.radius) {
            const t = 1 - (dist / flatten.radius);
            const smoothT = smoothstep(0, 1, t);
            blendedHeight = lerp(blendedHeight, flatten.height, smoothT);
          }
        });

        burrows.forEach(burrow => {
          const dist = currentVertexPosition.distanceTo(burrow.position);
          if (dist < burrow.radius) {
            const t = 1 - (dist / burrow.radius);
            const smoothT = smoothstep(0, 1, t);
            blendedHeight -= burrow.depth * smoothT;
          }
        });

        adds.forEach(add => {
          const dist = currentVertexPosition.distanceTo(add.position);
          if (dist < add.radius) {
            const t = 1 - (dist / add.radius);
            const smoothT = smoothstep(0, 1, t);
            blendedHeight += add.height * smoothT;
          }
        });


        // --- 3. Terrain Vertex & Color Data ---

        positions.push(worldX, blendedHeight, worldZ);
        vertexColors.push(blendedColor.r, blendedColor.g, blendedColor.b);
        tempNormals.push(0, 0, 0);

        // -- 3.1 Grass Spawning Logic (Run this ONCE per chunk, not per vertex)
        for (let i = 0; i < grassCount; i++) {
            const lx = Math.random() * chunkSize;
            const lz = Math.random() * chunkSize;
            const gWorldX = lx + chunkX * chunkSize;
            const gWorldZ = lz + chunkY * chunkSize;

            const height = calculateHeightAt(gWorldX, gWorldZ, { /* settings */ });
            
            if (height > baseTerrainOffset + 0.5) {
                grassPositions.push(new Vector3(gWorldX, height, gWorldZ));
            }
        }
        /*
        // --- 4. Tree Spawning Logic ---
        if (ix < resolution && iy < resolution && blendedHeight > baseTerrainOffset + 1) { 
            
            const mainBiome = influencingBiomes.length > 0 ? influencingBiomes[0].biome : null;
            const mainBiomeName = mainBiome ? mainBiome.name : null;
            
            if (mainBiomeName) {
                const isWaterOrBeach = mainBiomeName === 'ocean' || mainBiomeName === 'beach';

                if (!isWaterOrBeach) {
                    const isTooClose = existingTreePositions.some(pos => pos.distanceTo(new Vector3(worldX, 0, worldZ)) < MIN_TREE_SPACING);
                    
                    if (Math.random() < TREE_SPAWN_CHANCE && !isTooClose) {
                        
                        let assetKey = 'broadleaf';
                        // ... (Biome-based asset selection logic) ...
                        if (mainBiomeName.includes('tundra') || mainBiomeName.includes('alpine')) {
                            assetKey = 'conifer';
                        } else if (mainBiomeName.includes('desert') || mainBiomeName.includes('savanna')) { 
                            assetKey = 'cactus';
                        }
                        
                        const asset = treeAssets[assetKey];
                        const trunkScaleY = getRandomArbitrary(asset.minScale[1], asset.maxScale[1]);
                        const trunkScaleXZ = getRandomArbitrary(asset.minScale[0], asset.maxScale[0]);
                        
                        const treeY = blendedHeight + (trunkScaleY / 2); 

                        const treeData = {
                            id: `${chunkX}_${chunkY}_tree_${ix}_${iy}`,
                            position: new Vector3(worldX, treeY, worldZ),
                            scale: new Vector3(trunkScaleXZ, trunkScaleY, trunkScaleXZ),
                            color: asset.trunkColor,
                            foliageColor: asset.color,
                        };

                        treePositions.push(treeData);
                        existingTreePositions.push(new Vector3(worldX, 0, worldZ)); // Track XZ position
                    }
                }
            }
        }
        */
// --- 4. Tree Spawning Logic ---
if (ix < resolution && iy < resolution && blendedHeight > baseTerrainOffset + 1) { 
    const mainBiome = influencingBiomes.length > 0 ? influencingBiomes[0].biome : null;
    const mainBiomeName = mainBiome ? mainBiome.name : null;
    
    if (mainBiomeName) {
        const isWaterOrBeach = mainBiomeName === 'ocean' || mainBiomeName === 'beach';

        if (!isWaterOrBeach) {
            const isTooClose = existingTreePositions.some(pos => pos.distanceTo(new Vector3(worldX, 0, worldZ)) < MIN_TREE_SPACING);
            
            if (Math.random() < TREE_SPAWN_CHANCE && !isTooClose) {
                let assetKey = 'broadleaf';
                if (mainBiomeName.includes('tundra') || mainBiomeName.includes('alpine')) assetKey = 'conifer';
                else if (mainBiomeName.includes('desert') || mainBiomeName.includes('savanna')) assetKey = 'cactus';

                const template = treeTemplates[assetKey];
                
                const treeData = {
                    id: `${chunkX}_${chunkY}_tree_${ix}_${iy}`,
                    // This is the WORLD POSITION that GenshinTree will use to offset its vertices
                    pos: [worldX, blendedHeight, worldZ], 
                    ...template,
                    height: template.height * (0.8 + Math.random() * 0.4),
                    trunkHeight: template.trunkHeight * (0.9 + Math.random() * 0.2)
                };

                treePositions.push(treeData);
                existingTreePositions.push(new Vector3(worldX, 0, worldZ)); 
            }
        }
    }
}


        // --- 5. Rock & Mineral Spawning Logic ---
        if (ix < resolution && iy < resolution && blendedHeight > baseTerrainOffset + 1) {

            const mainBiome = influencingBiomes.length > 0 ? influencingBiomes[0].biome : null;
            const mainBiomeName = mainBiome ? mainBiome.name : null;
            
            if (mainBiomeName) {
                
                // **Rock Spawning**
                if (ROCKS_COMMON_BIOMES.includes(mainBiomeName) && Math.random() < ROCK_SPAWN_CHANCE) {
                    
                    const currentRockPos2D = new Vector3(worldX, 0, worldZ);
                    
                    // Check if the potential rock position is too close to any existing tree
                    const isTooCloseToTree = existingTreePositions.some(
                        pos => pos.distanceTo(currentRockPos2D) < MIN_ROCK_TREE_SPACING
                    );

                    if (isTooCloseToTree) {
                        continue; 
                    }

                    const assetKey = (mainBiomeName === 'mountain' || mainBiomeName === 'alpine') ? 'boulder' : 'pebble';
                    const asset = rockAssets[assetKey];
                    
                    const scale = getRandomScale(asset.minScale, asset.maxScale);
                    const rockY = blendedHeight + (scale.y / 2) - (getRandomArbitrary(0, 0.2)); 

                    let rockData = {
                        id: `rock_${chunkX}_${chunkY}_${ix}_${iy}`,
                        position: new Vector3(worldX, rockY, worldZ),
                        scale: scale,
                        color: asset.color,
                        isMineralVein: false,
                        mineralType: null,
                        metalness: 0.1, // Default values
                        roughness: 0.8, // Default values
                    };

                    // Check for Mineral Vein presence
                    const mineralPresenceNoise = fbm(worldX * MINERAL_VEIN_NOISE_SCALE, worldZ * MINERAL_VEIN_NOISE_SCALE, 3);
                    
                    if (MINERAL_COMMON_BIOMES.includes(mainBiomeName) && mineralPresenceNoise > MINERAL_VEIN_THRESHOLD) {
                        
                        const MINERAL_TYPE_NOISE_SCALE = 0.0003; 
                        const mineralTypeNoise = fbm(worldX * MINERAL_TYPE_NOISE_SCALE, worldZ * MINERAL_TYPE_NOISE_SCALE, 1);
                        
                        const suitableMinerals = Object.entries(mineralAssets).filter(([key, props]) => 
                            props.biomes.includes(mainBiomeName)
                        );
                        
                        // Select a mineral based on a simple noise mapping
                        let selectedMineral = suitableMinerals[Math.floor((mineralTypeNoise + 1) / 2 * suitableMinerals.length)] || null;
                        if (!selectedMineral && suitableMinerals.length > 0) {
                             selectedMineral = suitableMinerals[0];
                        }

                        if (selectedMineral) {
                            const [type, props] = selectedMineral;
                            
                            rockData.color = props.color;
                            rockData.scale.multiplyScalar(1.5);
                            rockData.isMineralVein = true;
                            rockData.mineralType = type;
                            rockData.metalness = props.metalness;
                            rockData.roughness = props.roughness;
                        }
                    }

                    rockPositions.push(rockData);
                }
            }
        }
      }
    }

    // --- 6. Indices and Normals Calculation (Unchanged) ---

    // Indices calculation
    for (let iy = 0; iy < resolution; iy++) {
      for (let ix = 0; ix < resolution; ix++) {
        const a = ix + iy * (resolution + 1);
        const b = ix + (iy + 1) * (resolution + 1);
        const c = (ix + 1) + (iy + 1) * (resolution + 1);
        const d = (ix + 1) + iy * (resolution + 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // Normal calculation (unchanged)
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;

      const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
      const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
      const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      tempNormals[ia] += nx; tempNormals[ia + 1] += ny; tempNormals[ia + 2] += nz;
      tempNormals[ib] += nx; tempNormals[ib + 1] += ny; tempNormals[ib + 2] += nz;
      tempNormals[ic] += nx; tempNormals[ic + 1] += ny; tempNormals[ic + 2] += nz;
    }

    const normals = [];
    for (let i = 0; i < tempNormals.length; i += 3) {
      const x = tempNormals[i];
      const y = tempNormals[i + 1];
      const z = tempNormals[i + 2];
      const len = Math.hypot(x, y, z) || 1;
      normals.push(x / len, y / len, z / len);
    }

    return {
      vertices: new Float32Array(positions),
      indices: new Uint32Array(indices),
      normals: new Float32Array(normals),
      colors: new Float32Array(vertexColors),
      treePositions,
      rockPositions, 
      villagePositions, // Returned village data
      grassPositions, // Returned grass data
    };
  }, [
    chunkSize, resolution, chunkX, chunkY,
    baseElevationScale, tempBiomeScale, humBiomeScale,
    terrainBaseFreq,
    mountainRangeFreq, mountainRangeIntensity, mountainRangeOctaves, mountainRangePersistence,
    baseTerrainOffset,
    editTrigger,
  ]);

  return (
    <>
      {/* --- Terrain Mesh Rendering (Unchanged) --- */}
      {forceEnablePhysics ? (
        <RigidBody type="fixed" colliders="trimesh">
          <mesh receiveShadow>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" array={vertices} count={vertices.length / 3} itemSize={3} />
              <bufferAttribute attach="attributes-normal" array={normals} count={normals.length / 3} itemSize={3} />
              <bufferAttribute attach="attributes-color" array={colors} count={colors.length / 3} itemSize={3} />
              <bufferAttribute attach="index" array={indices} count={indices.length} itemSize={1} />
            </bufferGeometry>
            <meshStandardMaterial vertexColors flatShading={false} />
          </mesh>
        </RigidBody>
      ) : (
        <mesh receiveShadow renderOrder={1}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={vertices} count={vertices.length / 3} itemSize={3} />
            <bufferAttribute attach="attributes-normal" array={normals} count={normals.length / 3} itemSize={3} />
            <bufferAttribute attach="attributes-color" array={colors} count={colors.length / 3} itemSize={3} />
            <bufferAttribute attach="index" array={indices} count={indices.length} itemSize={1} />
          </bufferGeometry>
          <meshStandardMaterial vertexColors flatShading={false} />
        </mesh>
      )}
        {/* 
        
      {treePositions.map(tree => (
          <RigidBody key={tree.id} type="fixed" colliders="cuboid" position={tree.position}>
              <mesh>
                  <boxGeometry args={[tree.scale.x, tree.scale.y, tree.scale.z]} />
                  <meshStandardMaterial color={tree.color} />
              </mesh>
              <mesh position={[0, tree.scale.y * 0.4, 0]}> 
                  <sphereGeometry args={[tree.scale.x * 4, 8, 8]} />
                  <meshStandardMaterial color={tree.foliageColor} />
              </mesh>
          </RigidBody>
      ))}

      {rockPositions.map(rock => (
          <RigidBody key={rock.id} type="fixed" colliders="cuboid" position={rock.position}>
              <mesh>
                  <dodecahedronGeometry args={[rock.scale.x, 0]} scale={[rock.scale.x, rock.scale.y, rock.scale.z]} />
                  <meshStandardMaterial 
                      color={rock.color} 
                      // Use specific mineral properties if it's a vein
                      metalness={rock.metalness}
                      roughness={rock.roughness}
                  />
              </mesh>
          </RigidBody>
      ))}

      {villagePositions.map(building => (
          <RigidBody key={building.id} type="fixed" colliders="cuboid" position={building.position}>
              <mesh>
                  <boxGeometry args={[building.scale.x, building.scale.y, building.scale.z]} />
                  <meshStandardMaterial color={building.color} />
              </mesh>
          </RigidBody>
      ))}
    */}

     {treePositions.map(tree => {
    const colliderRadius = tree.shape === 'pine' ? 1.4 : 0.8;
    
    return (
        <React.Fragment key={tree.id}>
            {/* RigidBody for Physics (Locked at world position) */}
            <RigidBody type="fixed" position={tree.pos}>
                <CylinderCollider 
                    args={[tree.trunkHeight / 2, colliderRadius]} 
                    position={[0, tree.trunkHeight / 2, 0]} 
                />
            </RigidBody>
            
            {/* Visuals: Now handles worldOffset [worldX, y, worldZ] internally */}
            {/* renderOrder ensures foliage is drawn after the ocean plane */}
            <GenshinTree config={tree} renderOrder={1000} />
        </React.Fragment>
    );
})}



      {rockPositions.map(rock => (
          <RigidBody key={rock.id} type="fixed" colliders="cuboid" position={rock.position}>
              <mesh>
                  <dodecahedronGeometry args={[rock.scale.x, 0]} scale={[rock.scale.x, rock.scale.y, rock.scale.z]} />
                  <meshStandardMaterial 
                      color={rock.color} 
                      // Use specific mineral properties if it's a vein
                      metalness={rock.metalness}
                      roughness={rock.roughness}
                  />
              </mesh>
          </RigidBody>
      ))}

      {villagePositions.map(building => (
          <RigidBody key={building.id} type="fixed" colliders="cuboid" position={building.position}>
              <mesh>
                  <boxGeometry args={[building.scale.x, building.scale.y, building.scale.z]} />
                  <meshStandardMaterial color={building.color} />
              </mesh>
          </RigidBody>
      ))}
      
      <Grass positions={grassPositions} />
    </>
  );
};