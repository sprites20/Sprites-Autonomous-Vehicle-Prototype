import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders";

// Constants for grass blade geometry
const BLADE_WIDTH = 0.1;
const BLADE_HEIGHT = 0.8;
const BLADE_HEIGHT_VARIATION = 0.6;
const BLADE_VERTEX_COUNT = 5;
const BLADE_TIP_OFFSET = 0.1;

// Helper function for linear interpolation
function interpolate(val, oldMin, oldMax, newMin, newMax) {
  return ((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
}

// Global texture resolution for procedurally generated textures
const TEXTURE_RESOLUTION = 256; // e.g., 256x256, 512x512
const INITIAL_GROUND_TEXTURE_REPEAT = 10;

// --- Function to generate a simple grass ground texture ---
function generateGrassGroundTexture(
  width,
  height,
  color1 = 0x558833,
  color2 = 0x77aa44
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const c1 = new THREE.Color(color1);
  const c2 = new THREE.Color(color2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mixFactor =
        (Math.sin(x * 0.1) + Math.cos(y * 0.1) + Math.random() * 0.5) / 2.5;
      const color = new THREE.Color().copy(c1).lerp(c2, mixFactor);
      ctx.fillStyle = `#${color.getHexString()}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    INITIAL_GROUND_TEXTURE_REPEAT,
    INITIAL_GROUND_TEXTURE_REPEAT
  );
  texture.needsUpdate = true;
  return texture;
}

// Declare cloudTexture as 'let' and initialize it
let cloudTexture = null; // Or new THREE.Texture() if your shader can handle an empty texture

/**
 * GrassGeometry creates custom geometry for a field of grass blades.
 * Each blade's Y-position is now based on a flat plane.
 */
export class GrassGeometry extends THREE.BufferGeometry {
  /**
   * @param {number} areaSize - The side length of the square area where grass blades will be dense.
   * @param {number} count - The number of individual grass blades to generate within `areaSize`.
   * @param {THREE.Vector2} tileOffsetUV - The UV offset of this tile within the global texture (0-1 range).
   * @param {number} tileUVScale - The UV scale of this tile within the global texture (0-1 range).
   */
  constructor(areaSize, count, tileOffsetUV, tileUVScale) {
    super();

    const positions = [];
    const uvs = []; // UVs for global texture mapping for coloring grass blades
    const indices = [];

    this.tileOffsetUV = tileOffsetUV;
    this.tileUVScale = tileUVScale;

    // The ground is now flat, so base height is 0
    const baseHeight = 0;

    for (let i = 0; i < count; i++) {
      const x = Math.random() * areaSize - areaSize / 2;
      const z = Math.random() * areaSize - areaSize / 2;

      // Add a small offset to lift the blade base slightly above the terrain plane
      const bladeY = baseHeight + 0.05; // Adjust this value (e.g., 0.01 to 0.1)

      // Calculate UVs for global texture mapping for grass blade color consistency
      uvs.push(
        ...Array.from({ length: BLADE_VERTEX_COUNT }).flatMap((_, vtxIdx) => {
          const localNormalizedX = interpolate(
            x,
            -areaSize / 2,
            areaSize / 2,
            0,
            1
          );
          const localNormalizedZ = interpolate(
            z,
            -areaSize / 2,
            areaSize / 2,
            0,
            1
          );
          const globalGrassUVX =
            this.tileOffsetUV.x + localNormalizedX * this.tileUVScale;
          const globalGrassUVY =
            this.tileOffsetUV.y + localNormalizedZ * this.tileUVScale;
          return [globalGrassUVX, globalGrassUVY];
        })
      );

      // Pass the adjusted bladeY to computeBlade
      const blade = this.computeBlade([x, bladeY, z], i);
      positions.push(...blade.positions);
      indices.push(...blade.indices);
    }

    this.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    );
    this.setAttribute(
      "uv", // These UVs are now global UVs for the ground texture
      new THREE.BufferAttribute(new Float32Array(uvs), 2)
    );
    this.setIndex(indices);
    this.computeVertexNormals();
  }

  computeBlade(center, index = 0) {
    const height = BLADE_HEIGHT + Math.random() * BLADE_HEIGHT_VARIATION;
    const vIndex = index * BLADE_VERTEX_COUNT;

    const yaw = Math.random() * Math.PI * 2;
    const yawVec = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const bend = Math.random() * Math.PI * 2;
    const bendVec = [Math.sin(bend), 0, -Math.cos(bend)];

    const bl = yawVec.map((n, i) =>
      i === 1 ? center[i] : n * (BLADE_WIDTH / 2) * 1 + center[i]
    );
    const br = yawVec.map((n, i) =>
      i === 1 ? center[i] : n * (BLADE_WIDTH / 2) * -1 + center[i]
    );
    const tl = yawVec.map((n, i) =>
      i === 1 ? center[i] + height / 2 : n * (BLADE_WIDTH / 4) * 1 + center[i]
    );
    const tr = yawVec.map((n, i) =>
      i === 1 ? center[i] + height / 2 : n * (BLADE_WIDTH / 4) * -1 + center[i]
    );
    const tc = bendVec.map((n, i) =>
      i === 1 ? center[i] + height : n * BLADE_TIP_OFFSET + center[i]
    );

    return {
      positions: [...bl, ...br, ...tr, ...tl, ...tc],
      indices: [
        vIndex,
        vIndex + 1,
        vIndex + 2,
        vIndex + 2,
        vIndex + 3,
        vIndex,
        vIndex + 2,
        vIndex + 4,
        vIndex + 3,
      ],
    };
  }
}

/**
 * Grass manages the main grass blade mesh and the terrain floor mesh.
 * It's structured as a THREE.Mesh itself, with the floor as a child.
 */
export class Grass extends THREE.Mesh { // Changed to directly export the Grass class
  /**
   * @param {number} terrainPlaneSize - The overall side length of the square terrain plane for THIS TILE.
   * @param {number} grassBladeAreaSize - The side length of the square area where 3D grass blades are rendered densely for THIS TILE.
   * @param {number} count - The number of individual grass blades to render within `grassBladeAreaSize`.
   * @param {THREE.Texture} globalGroundTexturePattern - The ground texture for the entire world (can still be repeated per tile).
   * @param {THREE.Vector2} tileOffsetUV - The UV offset of this tile within the global texture (0-1 range).
   * @param {number} tileUVScale - The UV scale of this tile within the global texture (0-1 range).
   * @param {number} initialGroundTextureRepeat - The base repeat value for the ground texture.
   */
  constructor(
    terrainPlaneSize,
    grassBladeAreaSize,
    count,
    globalGroundTexturePattern,
    tileOffsetUV,
    tileUVScale,
    initialGroundTextureRepeat
  ) {
    // Create grass blades for the central dense area on a flat plane
    const geometry = new GrassGeometry(
      grassBladeAreaSize,
      count,
      tileOffsetUV,
      tileUVScale
    );

    // If cloudTexture is not yet loaded, we might use a placeholder or wait.
    // The shader will get the current value of cloudTexture.
    const effectiveCloudTexture = cloudTexture || new THREE.Texture(); // Fallback if still null

    const bladeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCloud: { value: effectiveCloudTexture }, // Use the effective texture here
        uTime: { value: 0 },
        // Heightmap related uniforms removed
      },
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader,
    });
    super(geometry, bladeMaterial);

    // Store the material reference for later uniform updates
    this.bladeMaterial = bladeMaterial; // Add this line

    // Removed the creation and addition of the static floor mesh
    /*
    // --- Setup for the large, "infinite" terrain plane (this tile's part) ---
    const floorSegments = TEXTURE_RESOLUTION - 1;

    const floorGeometry = new THREE.PlaneGeometry(
      terrainPlaneSize,
      terrainPlaneSize,
      floorSegments,
      floorSegments
    ).rotateX(-Math.PI / 2);

    // Adjust UVs for the floor plane to map to the global texture coordinates
    const uvAttribute = floorGeometry.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
      const u = uvAttribute.getX(i);
      const v = uvAttribute.getY(i);

      uvAttribute.setXY(
        i,
        tileOffsetUV.x + u * tileUVScale,
        tileOffsetUV.y + v * tileUVScale
      );
    }
    uvAttribute.needsUpdate = true;

    const tileGroundTexture = globalGroundTexturePattern.clone();
    tileGroundTexture.wrapS = tileGroundTexture.wrapT = THREE.RepeatWrapping;
    const conceptualUnitSize = 25;
    const tileRepeatFactor = terrainPlaneSize / conceptualUnitSize;
    tileGroundTexture.repeat.set(
      initialGroundTextureRepeat * tileRepeatFactor,
      initialGroundTextureRepeat * tileRepeatFactor
    );
    tileGroundTexture.needsUpdate = true;

    const floorMaterial = new THREE.MeshStandardMaterial({
      map: tileGroundTexture,
      // Displacement map related properties removed
      color: 0x88aa44,
      side: THREE.DoubleSide,
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);

    floor.castShadow = true;
    floor.receiveShadow = true;

    this.add(floor);
    */
  }

  update(time) {
    if (this.bladeMaterial && this.bladeMaterial.uniforms.uTime) {
      this.bladeMaterial.uniforms.uTime.value = time;
    }
    // Also, update the cloud texture uniform if it has changed from null/placeholder
    if (
      this.bladeMaterial &&
      this.bladeMaterial.uniforms.uCloud &&
      this.bladeMaterial.uniforms.uCloud.value !== cloudTexture
    ) {
      this.bladeMaterial.uniforms.uCloud.value = cloudTexture;
    }
  }
}

// Export common variables. Grass class is now directly exported.
export {
  generateGrassGroundTexture,
  cloudTexture,
  TEXTURE_RESOLUTION,
  INITIAL_GROUND_TEXTURE_REPEAT,
};
