import React, { useRef, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, DoubleSide } from 'three'; // Changed Uint16BufferAttribute to Uint32BufferAttribute
import { useFrame } from '@react-three/fiber';

/**
 * Convert 3D (x, y, z) grid coordinates to 1D index.
 * Assumes a row-major order: x then y then z.
 */
function getParticleIndex(x, y, z, size) {
  // Ensure the formula correctly maps your 3D grid to the 1D array.
  // This formula looks correct for x, y, z -> x + y*size + z*size*size
  return x + y * size + z * size * size;
}

/**
 * Generates indices for a cube's surface — only using particles that exist.
 * This assumes a fixed grid where particles might exist or not.
 */
function generateCubeSurfaceIndices(size, particleMap) {
  const indices = [];

  const addQuad = (v0, v1, v2, v3) => {
    // Only add quad if all four vertices are valid (exist)
    if (v0 === null || v1 === null || v2 === null || v3 === null) {
      return; // Skip if any vertex is missing
    }
    indices.push(v0, v1, v2);
    indices.push(v0, v2, v3);
  };

  const getIndexIfExists = (x, y, z) => {
    // Boundary check and particle existence check
    if (
      x >= 0 && y >= 0 && z >= 0 &&
      x < size && y < size && z < size &&
      particleMap.has(`${x}-${y}-${z}`)
    ) {
      return getParticleIndex(x, y, z, size);
    }
    return null;
  };

  // Iterate through each face of the conceptual cube to find existing quads.
  // The loops run up to size - 1 because each quad connects 4 points.

  // Front (+Z face) - Faces along z = size - 1 plane
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v0 = getIndexIfExists(x, y, size - 1);
      const v1 = getIndexIfExists(x + 1, y, size - 1);
      const v2 = getIndexIfExists(x + 1, y + 1, size - 1);
      const v3 = getIndexIfExists(x, y + 1, size - 1);
      addQuad(v0, v1, v2, v3);
    }
  }

  // Back (-Z face) - Faces along z = 0 plane
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v0 = getIndexIfExists(x + 1, y, 0);
      const v1 = getIndexIfExists(x, y, 0);
      const v2 = getIndexIfExists(x, y + 1, 0);
      const v3 = getIndexIfExists(x + 1, y + 1, 0);
      addQuad(v0, v1, v2, v3);
    }
  }

  // Top (+Y face) - Faces along y = size - 1 plane
  for (let z = 0; z < size - 1; z++) {
    for (let x = 0; x < size - 1; x++) {
      const v0 = getIndexIfExists(x, size - 1, z);
      const v1 = getIndexIfExists(x + 1, size - 1, z);
      const v2 = getIndexIfExists(x + 1, size - 1, z + 1);
      const v3 = getIndexIfExists(x, size - 1, z + 1);
      addQuad(v0, v1, v2, v3);
    }
  }

  // Bottom (-Y face) - Faces along y = 0 plane
  for (let z = 0; z < size - 1; z++) {
    for (let x = 0; x < size - 1; x++) {
      const v0 = getIndexIfExists(x, 0, z + 1);
      const v1 = getIndexIfExists(x + 1, 0, z + 1);
      const v2 = getIndexIfExists(x + 1, 0, z);
      const v3 = getIndexIfExists(x, 0, z);
      addQuad(v0, v1, v2, v3);
    }
  }

  // Left (-X face) - Faces along x = 0 plane
  for (let z = 0; z < size - 1; z++) {
    for (let y = 0; y < size - 1; y++) {
      const v0 = getIndexIfExists(0, y, z + 1);
      const v1 = getIndexIfExists(0, y, z);
      const v2 = getIndexIfExists(0, y + 1, z);
      const v3 = getIndexIfExists(0, y + 1, z + 1);
      addQuad(v0, v1, v2, v3);
    }
  }

  // Right (+X face) - Faces along x = size - 1 plane
  for (let z = 0; z < size - 1; z++) {
    for (let y = 0; y < size - 1; y++) {
      const v0 = getIndexIfExists(size - 1, y, z);
      const v1 = getIndexIfExists(size - 1, y, z + 1);
      const v2 = getIndexIfExists(size - 1, y + 1, z + 1);
      const v3 = getIndexIfExists(size - 1, y + 1, z);
      addQuad(v0, v1, v2, v3);
    }
  }

  return new Uint32Array(indices); // Changed to Uint32Array
}

/**
 * The dynamic mesh surface renderer for JellyCube.
 */
export function JellyCubeSurfaceMesh({ particleMap, size, color }) {
  const meshRef = useRef();
  const geometryRef = useRef();

  // Initialize geometry once, but re-generate indices if particleMap's content changes
  const { positionsArray, indicesArray } = useMemo(() => {
    // Max possible particles if all grid cells contain one
    const numParticles = size * size * size;
    const pos = new Float32Array(numParticles * 3); // x,y,z per vertex

    // Initialize with zeros. These will be overwritten by actual particle positions.
    // If a particle doesn't exist, its corresponding position in the array will remain (0,0,0)
    // but its index won't be used in the `indicesArray`.
    for (let i = 0; i < pos.length; i++) pos[i] = 0;

    // Generate indices based on the initial state of the particleMap
    // IMPORTANT: If the *contents* (presence/absence of particles) of particleMap.current
    // change after initial render, this useMemo needs to re-run.
    // Adding particleMap.current to dependencies achieves this, BUT will cause
    // performance issues if the map changes frequently.
    const indices = generateCubeSurfaceIndices(size, particleMap.current);
    console.log(`Generated indices with ${indices.length} triangles.`);

    return { positionsArray: pos, indicesArray: indices };
  }, [size, particleMap.current]); // Added particleMap.current to dependencies

  // Update positions on every frame
  useFrame(() => {
    const positions = geometryRef.current.attributes.position.array;
    let idx = 0; // Index for the positions array

    // Iterate through the 3D grid
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const key = `${x}-${y}-${z}`;
          const rb = particleMap.current.get(key); // Get the RAPIER RigidBody or similar
          if (rb) {
            const pos = rb.translation(); // Assuming rb.translation() returns an object with x, y, z
            positions[idx++] = pos.x;
            positions[idx++] = pos.y;
            positions[idx++] = pos.z;
          } else {
            // If no particle exists at this grid coordinate, set its position to (0,0,0)
            // These (0,0,0) positions won't be rendered because their indices aren't in `indicesArray`.
            positions[idx++] = 0;
            positions[idx++] = 0;
            positions[idx++] = 0;
          }
        }
      }
    }

    // Inform Three.js that the position buffer needs to be updated on the GPU
    geometryRef.current.attributes.position.needsUpdate = true;
    // Recompute normals for correct lighting after position changes
    geometryRef.current.computeVertexNormals();
    meshRef.current.frustumCulled = false;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          array={positionsArray}
          count={positionsArray.length / 3}
          itemSize={3}
          usage={BufferGeometry.DynamicDrawUsage} // Specifies that the buffer will be updated frequently
        />
        <bufferAttribute
          attach="index"
          array={indicesArray}
          count={indicesArray.length}
          itemSize={1}
        />
      </bufferGeometry>
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} side={DoubleSide} />
    </mesh>
  );
}