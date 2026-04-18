import React, { useMemo, useRef, useEffect } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import GenshinTree from './GenshinTree.jsx';

// --- Constants & Config ---
const GRID_SIZE = 2;
const BLOCK_DEPTH = 130;
const BLOCK_WIDTH = 220;
const STREET_WIDTH = 25;
const ALLEY_WIDTH = 12;
const SIDEWALK_HEIGHT = 0.2;
const PEDESTRIAN_SETBACK = 10;
const CURB_MARGIN = 5;
const DOOR_HEIGHT = 4;
const FLOOR_HEIGHT = 4;
const FIRST_FLOOR_BONUS = 0.5;

const TREE_SPACING = 20; // Distance between trees along the curb
const CURB_OFFSET = 1.5;   // How far from the edge of the sidewalk the tree sits

const WALL_THICKNESS = 0.5;
const STAIR_WIDTH = 3;

const PALETTES = {
  modern: ['#2c3e50', '#34495e', '#1a1a1a', '#223344', '#7f8c8d'],
  historic: ['#5d4037', '#4e342e', '#3e2723', '#8d6e63', '#6d4c41'],
  industrial: ['#455a64', '#37474f', '#263238', '#546e7a'],
  beige: ['#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63']
};


const TREE_TEMPLATES = {
    broadleaf: { shape: 'round', leafColors: ['#2d4c1e', '#3f6212', '#4d7c0f'], trunkColor: '#3b2a1e', height: 10*.4, trunkHeight: 6*.5, recursion: 4 },
    conifer: { shape: 'pine', leafColors: ['#064e3b', '#065f46', '#022c22'], trunkColor: '#1a1a1a', height: 32*.4, trunkHeight: 8*.5 },
    sakura: { shape: 'round', leafColors: ['#ffd1dc','#ffb3c6','#ffc0cb'], trunkColor: '#3b2f2f', height: 9*0.4, trunkHeight: 6*0.5, recursion: 4 },
    cactus: { shape: 'round', leafColors: ['#4ade80', '#22c55e', '#16a34a'], trunkColor: '#14532d', height: 6*.4, trunkHeight: 4*.5, recursion: 3 }
};

// --- Seeded Random Helper ---
const createStaticRNG = (seed) => {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

const getFloors = (type, rng) => {
  if (type === 'high') return 30 + Math.floor(rng() * 60);
  if (type === 'mid') return 8 + Math.floor(rng() * 15);
  return 3 + Math.floor(rng() * 3);
};

const getPalette = (type, rng) => {
  if (type === 'high') return PALETTES.modern;
  if (type === 'mid') return rng() > 0.5 ? PALETTES.historic : PALETTES.industrial;
  return PALETTES.beige;
};

const StreetLamp = ({ position = [0, 0, 0] }) => {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 5, 12]} />
        <meshStandardMaterial color="#2b2b2b" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Arm */}
      <mesh position={[0.4, 4.8, 0]} rotation={[0, 0, Math.PI / 6]}>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />
        <meshStandardMaterial color="#2b2b2b" />
      </mesh>

      {/* Lamp Head */}
      <mesh position={[0.9, 4.6, 0]}>
        <boxGeometry args={[0.4, 0.25, 0.4]} />
        <meshStandardMaterial color="#444" />
      </mesh>

      {/* Light Bulb */}
      <mesh position={[0.9, 4.45, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial 
          color="#fff5cc"
          emissive="#ffd966"
          emissiveIntensity={2}
        />
      </mesh>

      {/* Light Source */}
      <pointLight
        position={[0.9, 4.4, 0]}
        intensity={2}
        distance={10}
        decay={2}
        color="#ffd966"
      />
    </group>
  );
}

// --- Internal Stair Component ---
const InternalStairs = ({ floors, floorHeight, buildingWidth, buildingDepth, face }) => {
  const stairs = [];
  const stairW = 4;
  const stairL = floorHeight * 2; // Length of the ramp

  for (let f = 0; f < floors - 1; f++) {
    const isEven = f % 2 === 0;
    // Alternate sides for a zig-zag effect
    const xPos = isEven ? -buildingWidth / 4 : buildingWidth / 4;
    const zPos = (buildingDepth / 4) * -face; // Keep stairs toward the back
    const yPos = (f * floorHeight) + (floorHeight / 2) + SIDEWALK_HEIGHT;

    stairs.push(
      <RigidBody key={`stair-${f}`} type="fixed" position={[xPos, yPos, zPos]} rotation={[isEven ? 0.5 : -0.5, 0, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[stairW, 0.2, stairL]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <CuboidCollider args={[stairW / 2, 0.1, stairL / 2]} />
      </RigidBody>
    );
  }
  return <group>{stairs}</group>;
};

// --- Walkable Building Component ---
const WalkableBuilding = ({ b }) => {
  const halfW = b.w / 2;
  const halfD = b.d / 2;
  const halfH = b.h / 2;

  return (
    <group position={[b.x, 0, b.z]}>
      {/* 1. PHYSICAL WALL COLLIDERS */}
      <RigidBody type="fixed" position={[0, halfH + SIDEWALK_HEIGHT, 0]}>
        {/* Back Wall */}
        <CuboidCollider args={[halfW, halfH, 0.2]} position={[0, 0, -halfD * b.face]} />
        {/* Side Walls */}
        <CuboidCollider args={[0.2, halfH, halfD]} position={[-halfW, 0, 0]} />
        <CuboidCollider args={[0.2, halfH, halfD]} position={[halfW, 0, 0]} />
        
        {/* Front Wall with Door Opening (Split into 2 parts) */}
        <CuboidCollider args={[(b.w - 4) / 4, halfH, 0.2]} position={[-(b.w + 4) / 4, 0, halfD * b.face]} />
        <CuboidCollider args={[(b.w - 4) / 4, halfH, 0.2]} position={[(b.w + 4) / 4, 0, halfD * b.face]} />
        {/* Header above door */}
        <CuboidCollider args={[2, (b.h - DOOR_HEIGHT) / 2, 0.2]} position={[0, (b.h + DOOR_HEIGHT) / 2 - halfH, halfD * b.face]} />
      </RigidBody>

      {/* 2. VISUAL SHELL */}
      <mesh position={[0, halfH + SIDEWALK_HEIGHT, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color={b.color} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>

      {/* 3. INTERNAL FLOORS (with cutout for stairs) */}
      {Array.from({ length: b.floors }).map((_, f) => {
        const floorY = (f + 1) * FLOOR_HEIGHT + SIDEWALK_HEIGHT;
        if (floorY >= b.h + SIDEWALK_HEIGHT) return null;

        return (
          <RigidBody key={`floor-${f}`} type="fixed" position={[0, floorY, 0]}>
            {/* Floor Slab (Split to allow stair passage) */}
            <mesh receiveShadow>
              <boxGeometry args={[b.w - 0.5, 0.2, b.d - 0.5]} />
              <meshStandardMaterial color="#151515" />
            </mesh>
            <CuboidCollider args={[(b.w - 0.5) / 2, 0.1, (b.d - 0.5) / 2]} />
          </RigidBody>
        );
      })}

      {/* 4. STAIRS */}
      <InternalStairs 
        floors={b.floors} 
        floorHeight={FLOOR_HEIGHT} 
        buildingWidth={b.w} 
        buildingDepth={b.d} 
        face={b.face} 
      />
    </group>
  );
};

// --- Main City Component ---
export const City = ({ seed = 12345 }) => {
  const buildingRef = useRef();
  const windowRef = useRef();
  const slabRef = useRef();
  const mullionRef = useRef();
  const doorRef = useRef();

  // 1. DATA GENERATION (Seeded)
  const data = useMemo(() => {
    const rng = createStaticRNG(seed);
    const buildings = [];
    const sidewalks = [];
    const treePositions = [];
    const lampPositions = [];
    
    const fullW = BLOCK_WIDTH + STREET_WIDTH;
    const fullD = BLOCK_DEPTH + STREET_WIDTH;
    const offW = (GRID_SIZE * fullW) / 2;
    const offD = (GRID_SIZE * fullD) / 2;

    const treeTypes = Object.keys(TREE_TEMPLATES);

    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const bx = i * fullW - offW + fullW / 2;
        const bz = j * fullD - offD + fullD / 2;
        sidewalks.push({ x: bx, z: bz });

        const usableWidth = BLOCK_WIDTH - CURB_MARGIN * 2;
        const bDepth = BLOCK_DEPTH / 2 - ALLEY_WIDTH / 2 - PEDESTRIAN_SETBACK;
        const curbF = bz - BLOCK_DEPTH / 2;
        const curbB = bz + BLOCK_DEPTH / 2;

        // --- Tree Generation (Along Front and Back Curbs) ---
        [curbF + CURB_OFFSET, curbB - CURB_OFFSET].forEach((treeZ) => {
          let treeX = bx - (BLOCK_WIDTH / 2) + CURB_MARGIN + 5;
          const endTreeX = bx + (BLOCK_WIDTH / 2) - CURB_MARGIN - 5;

          let prevTree = null;
          let count = 0;

          while (treeX < endTreeX) {
            const templateKey = treeTypes[Math.floor(rng() * treeTypes.length)];
            const template = TREE_TEMPLATES["broadleaf"];

            const currentTree = {
              id: `tree-${i}-${j}-${treeX}-${treeZ}`,
              pos: [treeX, SIDEWALK_HEIGHT, treeZ],
              ...template,
              height: template.height * (0.8 + rng() * 0.4),
              trunkHeight: template.trunkHeight * (0.9 + rng() * 0.2)
            };

            treePositions.push(currentTree);

            // 🌆 Spawn lamp every 2 trees
            if (count % 2 === 1 && prevTree) {
              const midX = (currentTree.pos[0] + prevTree.pos[0]) / 2;
              const midZ = treeZ;

              lampPositions.push({
                id: `lamp-${i}-${j}-${midX}-${midZ}`,
                pos: [midX, SIDEWALK_HEIGHT, midZ]
              });
            }

            prevTree = currentTree;
            count++;

            treeX += TREE_SPACING + (rng() * 10);
          }
        });

        // --- Building Generation ---
        const sides = [
          { z: curbF + PEDESTRIAN_SETBACK + bDepth / 2, face: -1 },
          { z: curbB - PEDESTRIAN_SETBACK - bDepth / 2, face: 1 }
        ];

        sides.forEach((config) => {
          let currX = bx - usableWidth / 2;
          const endX = bx + usableWidth / 2;
          while (currX < endX - 5) {
            const rem = endX - currX;
            let lW = rem > 50 ? (rng() > 0.7 ? 40 : 25) : rem;
            const type = rng() > 0.7 ? 'high' : rng() > 0.4 ? 'mid' : 'low';
            const floors = getFloors(type, rng);
            const height = floors * FLOOR_HEIGHT + FIRST_FLOOR_BONUS;
            const palette = getPalette(type, rng);

            buildings.push({
              id: `${seed}-${buildings.length}`,
              x: currX + lW / 2,
              z: config.z,
              w: lW * (1 - CURB_MARGIN / usableWidth),
              d: bDepth,
              h: height,
              floors,
              type,
              face: config.face,
              color: palette[Math.floor(rng() * palette.length)],
              houseNumber: Math.floor(100 + rng() * 899)
            });
            currX += lW;
          }
        });
      }
    }
    return { buildings, sidewalks, treePositions, lampPositions };
  }, [seed]);

  // 2. COUNTS FOR INSTANCED MESHES
  const totalWindows = useMemo(() => data.buildings.reduce((acc, b) => acc + (b.floors * Math.floor(b.w / 4.5)), 0), [data]);
  const totalSlabs = useMemo(() => data.buildings.reduce((acc, b) => acc + (b.type !== 'high' ? b.floors : 0), 0), [data]);
  const totalMullions = useMemo(() => data.buildings.reduce((acc, b) => acc + (b.type === 'high' ? Math.floor(b.w / 4.5) : 0), 0), [data]);

  // 3. APPLY MATRICES & COLORS (Visuals)
  useEffect(() => {
    const rng = createStaticRNG(seed);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let winIdx = 0;
    let slabIdx = 0;
    let mullIdx = 0;

    data.buildings.forEach((b, i) => {
      // Building Body
      dummy.position.set(b.x, b.h / 2 + SIDEWALK_HEIGHT, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      buildingRef.current.setMatrixAt(i, dummy.matrix);
      buildingRef.current.setColorAt(i, color.set(b.color));

      // Door
      const faceZ = b.z + (b.d / 2 * b.face) + (0.11 * b.face);
      dummy.position.set(b.x, DOOR_HEIGHT / 2 + SIDEWALK_HEIGHT, faceZ);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.y = b.face === 1 ? 0 : Math.PI;
      dummy.updateMatrix();
      doorRef.current.setMatrixAt(i, dummy.matrix);

      // Windows & Details
      for (let f = 1; f < b.floors; f++) {
        const worldY = (f * FLOOR_HEIGHT) + FIRST_FLOOR_BONUS + (FLOOR_HEIGHT / 2) + SIDEWALK_HEIGHT;
        if (worldY > b.h + SIDEWALK_HEIGHT - 2) continue;

        for (let xOff = -b.w / 2 + 2.5; xOff < b.w / 2 - 2; xOff += 4.5) {
          dummy.position.set(b.x + xOff, worldY, faceZ - (0.05 * b.face));
          dummy.rotation.y = b.face === 1 ? 0 : Math.PI;
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          if (winIdx < totalWindows) {
            windowRef.current.setMatrixAt(winIdx, dummy.matrix);
            windowRef.current.setColorAt(winIdx, color.set(0xffffcc).multiplyScalar(0.5 + rng()));
            winIdx++;
          }
        }

        if (b.type !== 'high' && slabIdx < totalSlabs) {
          const sY = (f * FLOOR_HEIGHT) + FIRST_FLOOR_BONUS + SIDEWALK_HEIGHT;
          dummy.position.set(b.x, sY, b.z);
          dummy.scale.set(b.w + 0.4, 0.6, b.d + 0.4);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          slabRef.current.setMatrixAt(slabIdx++, dummy.matrix);
        }
      }

      if (b.type === 'high') {
        for (let xOff = -b.w / 2 + 1.5; xOff < b.w / 2; xOff += 5.5) {
          if (mullIdx < totalMullions) {
            dummy.position.set(b.x + xOff, b.h / 2 + SIDEWALK_HEIGHT, faceZ - (0.05 * b.face));
            dummy.scale.set(0.5, b.h, 0.5);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            mullionRef.current.setMatrixAt(mullIdx++, dummy.matrix);
          }
        }
      }
    });

    [buildingRef, windowRef, doorRef, slabRef, mullionRef].forEach(ref => {
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
        ref.current.geometry.computeBoundingSphere();
      }
    });
  }, [data, seed, totalWindows, totalSlabs, totalMullions]);

  useEffect(() => {
    if (buildingRef.current) {
      buildingRef.current.instanceMatrix.needsUpdate = true;
      buildingRef.current.geometry.computeBoundingSphere(); // Add this
      buildingRef.current.geometry.boundingSphere.radius = 10000; // 👈 force large radius
    }
  }, [data]);

  return (
    <group>
      {/* 1. Building Colliders */}
      {data.buildings.map((b) => (
        <WalkableBuilding key={b.id} b={b} />
      ))}

      {/* 2. Sidewalks & Colliders */}
      {data.sidewalks.map((s, i) => (
        <RigidBody key={`sw-${i}`} type="fixed" position={[s.x, SIDEWALK_HEIGHT / 2, s.z]}>
          <CuboidCollider args={[BLOCK_WIDTH / 2, SIDEWALK_HEIGHT / 2, BLOCK_DEPTH / 2]} />
          <mesh receiveShadow>
            <boxGeometry args={[BLOCK_WIDTH, SIDEWALK_HEIGHT, BLOCK_DEPTH]} />
            <meshStandardMaterial color="#323238" roughness={1} />
          </mesh>
        </RigidBody>
      ))}

      {/* 3. Ground Plane */}
      <RigidBody type="fixed" rotation={[-Math.PI / 2, 0, 0]}>
        <CuboidCollider args={[5000, 5000, 0.5]} />
        <mesh receiveShadow>
          <planeGeometry args={[10000, 10000]} />
          <meshStandardMaterial color="#050507" roughness={1} />
        </mesh>
      </RigidBody>


      {/* 5. Genshin Trees */}
      {data.treePositions.map(tree => {
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

      {/* 5.1 Street Lamps */}
      {data.lampPositions.map(lamp => (
        <StreetLamp key={lamp.id} position={lamp.pos} />
      ))}

      {/* 6. Instanced Meshes (Visuals) */}
      <instancedMesh ref={buildingRef} args={[null, null, data.buildings.length]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>

      <instancedMesh ref={windowRef} args={[null, null, totalWindows]} frustumCulled={false}>
        <planeGeometry args={[1.4, 1.8]} />
        <meshStandardMaterial emissive="#fff0aa" emissiveIntensity={1.5} transparent />
      </instancedMesh>

      <instancedMesh ref={doorRef} args={[null, null, data.buildings.length]} frustumCulled={false}>
        <boxGeometry args={[3.5, DOOR_HEIGHT, 0.2]} />
        <meshStandardMaterial color="#000000" metalness={0.8} roughness={0.1} />
      </instancedMesh>

      <instancedMesh ref={slabRef} args={[null, null, totalSlabs]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#0a0a0c" />
      </instancedMesh>

      <instancedMesh ref={mullionRef} args={[null, null, totalMullions]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#0a0a0c" />
      </instancedMesh>
    </group>
  );
};