import React, { useMemo, useRef, useEffect } from "react";
import { Box } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";

// =============================================================
//  UTILITIES
// =============================================================

// Renders individual meshes for elevator doors and stairwells on the core faces
const CoreDetails = ({ coreWalls, floors, floorHeight }) => {
  const details = [];
  const doorHeight = 2.2;
  const doorWidth = 1.2;
  const stairWidth = 2.4;
  const W_THICKNESS = 0.05; // Visual thickness of the door/stair element

  // Core Walls (from layout logic):
  // [0]: X-wall, Z-center: [core_x_span, H, core_wall_thickness] (Front/Back)
  // [1]: X-wall, Z-center: [core_x_span, H, core_wall_thickness] (Front/Back)
  // [2]: Z-wall, X-center: [core_wall_thickness, H, core_z_span] (Left/Right)
  // [3]: Z-wall, X-center: [core_wall_thickness, H, core_z_span] (Left/Right)

  // NOTE: This logic assumes a standard core layout where access is on the short (X) faces.
  // We'll place doors/stairs on walls [0] and [1] assuming the X-span is the typical entrance side.
  const wallA = coreWalls[0]; // Front/Back Wall 1
  const wallB = coreWalls[1]; // Front/Back Wall 2

  const [core_x_span, H, core_wall_thickness] = wallA.args;
  // const core_z_span = coreWalls[2].args[2]; // Unused variable removed

  const wallOffset = core_wall_thickness / 2 + W_THICKNESS / 2;

  // Elevator/Stair configuration for one side of the core (e.g., 3 elevators + 1 stair)
  // Total span for 4 elements (4 * ~2.5m pitch) = 10m
  const elementSpacing = 2.5; // Approximate center-to-center spacing
  const elementsPerCoreSide = 2; // e.g., Stair, E1, E2, E3
  const totalDoorSpan = elementSpacing * elementsPerCoreSide; // 10m

  // If your core is 10m wide, the spacing is centered.
  const startOffset = -core_x_span / 2 + (core_x_span - totalDoorSpan) / 2 + elementSpacing / 2;

  for (let yi = 0; yi < floors; yi++) {
    // const yCenter = yi * floorHeight + floorHeight / 2; // Unused variable removed
    const yBottom = yi * floorHeight;
    const yDoor = yBottom + (floorHeight - doorHeight) / 2 + doorHeight / 2;

    // --- Generate Details for Wall A and B (Entrance Faces) ---
    [wallA, wallB].forEach((wall, wallIndex) => {
      // Z-coordinate for the front face of the core
      // We assume the access is on the faces that run along the X-axis (coreWalls[0], [1])
      // Corrected logic for access face Z position
      const zAccess = wall.pos[2] + (wallIndex === 0 ? wallOffset : -wallOffset);
      // Removed unused `isStair` array, replaced with a check on the index (0 for stair)
      const isStairIndex = 0;

      for (let i = 0; i < elementsPerCoreSide; i++) {
        const xPos = wall.pos[0] + startOffset + i * elementSpacing;

        let visualWidth = doorWidth;
        let color = i === isStairIndex ? "#666666" : "#bbbbbb"; // Dark for stair, light metallic for elevator
        let depth = W_THICKNESS;

        if (i === isStairIndex) { // Stair is often wider
          visualWidth = stairWidth;
          // Center the stair detail properly
          const xCenterStair = wall.pos[0] + startOffset + (i * elementSpacing);
          const stairPos = [xCenterStair, yDoor, zAccess];

          // Draw a long thin box to represent the access point/door
          details.push({
            pos: stairPos,
            args: [visualWidth, doorHeight, depth],
            color: color,
            type: 'stair'
          });

          // Optionally add a dividing line to hint at two doors
          details.push({
            pos: [xCenterStair, yDoor, zAccess],
            args: [0.1, doorHeight, depth], // Thin vertical line
            color: "#444444",
            type: 'stair_divider'
          });

        } else { // Elevator Door
          details.push({
            pos: [xPos, yDoor, zAccess],
            args: [visualWidth, doorHeight, depth],
            color: color,
            type: 'elevator'
          });
        }
      }
    });
  }

  return (
    <group>
      {details.map((item, i) => (
        <mesh key={i} position={item.pos} renderOrder={100}>
          <boxGeometry args={item.args} />
          <meshStandardMaterial
            color={item.color}
            metalness={item.type === 'elevator' ? 0.8 : 0.0}
            roughness={item.type === 'elevator' ? 0.2 : 0.7}
          />
        </mesh>
      ))}
    </group>
  );
};
// Helper component for drawing beam lines (Instanced Mesh)
const BeamVisuals = ({ beams }) => {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  const beamMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#333333", // Darker for contrast
    transparent: true,
    opacity: 0.8
  }), []);

  useEffect(() => {
    if (!meshRef.current || !beams.length) return;
    beams.forEach((beam, i) => {
      const start = new THREE.Vector3(...beam.start);
      const end = new THREE.Vector3(...beam.end);
      const length = start.distanceTo(end);
      const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);

      dummy.position.copy(midpoint);
      dummy.scale.set(0.4, 0.4, 0.4);

      if (Math.abs(start.x - end.x) > 1e-3) {
        dummy.scale.x = length;
        // dummy.scale.z = 0.4; // Already set above
      } else if (Math.abs(start.z - end.z) > 1e-3) {
        dummy.scale.z = length;
        // dummy.scale.x = 0.4; // Already set above
      }
      // dummy.scale.y = 0.4; // Already set above

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [beams]);

  if (!beams.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      frustumCulled={false}
      args={[geometry, beamMaterial, beams.length]}
    />
  );
};


// =============================================================
//  INSTANCED MESH COMPONENTS
// =============================================================

function InstancedMeshGeneric({ items, color, geometryType = "BoxGeometry" }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color }), [color]);

  useEffect(() => {
    if (!meshRef.current || !items.length) return;
    items.forEach((it, i) => {
      const [x, y, z] = it.pos || it.center;
      // Fixed potential undefined destructuring by providing fallback array
      const [w, h, d] = it.args || [it.width, it.height, it.width] || [1, 1, 1];

      dummy.position.set(x, y, z);
      // Use fallback of 1 for scale if width/height/depth is not available or 0
      dummy.scale.set(w || 1, h || 1, d || 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [items]);

  if (!items.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      frustumCulled={false}
      args={[geometry, material, items.length]}
    />
  );
}

// Replaced InstancedCoreWall with a standard <group> and <mesh> for the 4 core walls.
const CoreWallIndividual = ({ items }) => {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#404040" }), []);
  return (
    <group>
      {items.map((wall, i) => (
        <mesh key={i} position={wall.pos} material={material}>
          <boxGeometry args={wall.args} />
        </mesh>
      ))}
    </group>
  );
};

const InstancedColumns = ({ items }) => (
  <InstancedMeshGeneric items={items} color={"#888888"} />
);
export const InstancedFloors = ({ items, color }) => (
  <InstancedMeshGeneric items={items} color={color} />
);

const InstancedBracingLines = ({ items }) => {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ff0000" }), []);

  useEffect(() => {
    if (!meshRef.current || !items.length) return;
    items.forEach((line, i) => {
      const start = new THREE.Vector3(...line.start);
      const end = new THREE.Vector3(...line.end);
      const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
      const length = start.distanceTo(end);

      dummy.position.copy(midpoint);

      // Rotation logic for lines on XZ plane faces:
      // The box is centered at midpoint. The default BoxGeometry is aligned with X/Y/Z.
      // We want to scale one dimension to 'length' and then rotate it to point from start to end.
      // The current logic tries to use the Z axis for length and rotates it, which is complex.
      // A better way is to calculate the rotation quaternion from the direction vector.

      // 1. Calculate the direction and length
      const direction = new THREE.Vector3().subVectors(end, start).normalize();

      // 2. Set scale: X and Y are thin, Z is the length
      dummy.scale.set(0.1, 0.1, length);

      // 3. Set rotation: Use lookAt, then rotate by an additional 90 degrees if needed
      // to align the Box's Z-axis (which has 'length') with the 'direction'.
      // BoxGeometry (1,1,1) Z-axis is the depth.
      // If we use lookAt(end), the dummy's local +Z axis will point to 'end'.
      dummy.lookAt(end);

      // The previous logic was: dummy.rotateX(Math.PI / 2);
      // This may be needed because lookAt aligns the *local* Z with the *global* direction,
      // and your box is defined as (width, height, depth) where depth is Z.
      // If the brace is in the X-Y plane (vertical face, Z out of the screen), you need to rotate
      // the local Z (length) axis to be in the plane of the face.

      // Simpler approach: Create a temporary object to hold the rotation logic
      const tempObject = new THREE.Object3D();
      tempObject.position.copy(start);
      tempObject.lookAt(end);

      // Apply the rotation from the temp object to the dummy
      dummy.quaternion.copy(tempObject.quaternion);
      // Now, adjust the rotation if the Box's 'length' axis is not Z (which it is here)
      // or if the default orientation is not what's expected from lookAt.

      // If the box is defined as (X, Y, Z) and we made Z the length,
      // 'lookAt' aligns the local Z axis with the direction vector. This is usually correct.
      // I'll keep the scale and position, and only use lookAt:

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [items]);

  if (!items.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      frustumCulled={false}
      args={[geometry, material, items.length]}
    />
  );
};

const InstancedGlassPanels = ({ items }) => {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0xADD8E6,
    transparent: true,
    opacity: 0.25,
    roughness: 0.1,
    metalness: 0.0,
    side: THREE.DoubleSide, // This is key for thin transparent objects
    depthWrite: false, // This is key for transparency sorting
  }), []);

  // Corrected the dependency array to include material only if it's dynamic
  // It's not dynamic, but good practice. More importantly, removed `material` from effect dependency.
  useEffect(() => {
    if (!meshRef.current || !items.length) return;

    items.forEach((it, i) => {
      const [x, y, z] = it.pos;
      const [w, h, d] = it.args;

      // The original issue was likely here: the scale was set to the full size of the panel,
      // but the geometry args is (1, 1, 1). So setting scale to [W, H, D] is correct.
      // The issue must be the visual thickness.

      // Check for extremely thin walls (w or d being the thickness)
      const minDimension = 0.01; // Minimum thickness for visibility/z-fighting
      const thicknessX = w === 0.05 || w === 0.02 ? minDimension : w; // Assuming 0.05 or 0.02 is the thickness
      const thicknessZ = d === 0.05 || d === 0.02 ? minDimension : d; // Assuming 0.05 or 0.02 is the thickness

      // Use the calculated thickness for the dimensions that are meant to be thin
      dummy.position.set(x, y, z);
      dummy.scale.set(w, h, d); // Revert to using the full args; the thickness should be calculated correctly in the useMemo.

      // Let's ensure the material's properties (depthWrite: false, side: DoubleSide) are the fix.
      // If the glass thickness is defined as `wallThickness = 0.05`, then `sizeArgs` is correct.

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [items]); // Removed 'material' from dependencies

  if (!items.length) return null;

  // renderOrder ensures this transparent instancedMesh draws after most opaque geometry
  return (
    <instancedMesh
      ref={meshRef}
      frustumCulled={false}
      args={[geometry, material, items.length]}
      renderOrder={999}
    />
  );
};

// =============================================================
//  BUILDING GEOMETRY GENERATOR
// =============================================================

function generateFloors(floors, roomWidth, roomDepth, floorHeight, slabThickness) {
  const floorsData = [];
  for (let yi = 0; yi < floors; yi++) {
    // Corrected Y-position to place the slab with its center at the floor level + half thickness
    const yCenter = yi * floorHeight + slabThickness / 2;
    floorsData.push({
      pos: [roomWidth / 2, yCenter, roomDepth / 2],
      args: [roomWidth, slabThickness, roomDepth],
    });
  }
  return floorsData;
}


// =============================================================
//  PROCEDURAL BUILDING (FINAL VERSION)
// =============================================================

export function ProceduralBuilding({
  floors,
  roomWidth,
  roomDepth,
  floorHeight,
  selectedCode,
  bracingType,
  applyAllSides,
  showGlass,
  exposedFaces = ["front", "back", "left", "right"],
}) {
  // --- 1. Determine structural type and max span ---
  const { structuralType, floorColor, maxSpan } = useMemo(() => {
    const span = Math.max(roomWidth, roomDepth);
    let type, color, spanMax;

    if (span <= 8) { type = "rc"; color = "lightgray"; spanMax = 8; }
    else if (span <= 25) { type = "pt"; color = "orange"; spanMax = 25; }
    else { type = "steel"; color = "steelblue"; spanMax = 30; }

    return { structuralType: type, floorColor: color, maxSpan: spanMax };
  }, [roomWidth, roomDepth]);

  // --- 2. Structural/Geometry Calculations (Columns, Nodes, Beams) ---
  const { columns, xSet, zSet, nodeMap } = useMemo(() => {
    const arr = [];

    // Grid generation using maxSpan
    const numSpansX = Math.ceil(roomWidth / maxSpan);
    const spacingX = roomWidth / numSpansX;
    const xPositions = Array.from({ length: numSpansX + 1 }, (_, i) => i * spacingX);

    const numSpansZ = Math.ceil(roomDepth / maxSpan);
    const spacingZ = roomDepth / numSpansZ;
    const zPositions = Array.from({ length: numSpansZ + 1 }, (_, i) => i * spacingZ);

    const RC_LOAD_FACTOR = 0.003;
    const maxBayArea = spacingX * spacingZ;
    const maxAxialLoadProxy = floors * maxBayArea * RC_LOAD_FACTOR;

    let minAxialRequiredWidth = Math.min(Math.sqrt(maxAxialLoadProxy), 1.0);
    const RC_BASE_MIN = 0.4;
    const STEEL_BASE_MIN = 0.5;
    const isSteelColumn = floors > 10 || structuralType === "steel";

    const RC_MIN_CLAMP_BASE = Math.max(RC_BASE_MIN, minAxialRequiredWidth * 0.75);
    const STEEL_MIN_CLAMP_BASE = Math.max(STEEL_BASE_MIN, minAxialRequiredWidth * 0.5);

    // Column segments
    for (let yi = 0; yi < floors; yi++) {
      const yBottom = yi * floorHeight;
      const segmentHeight = Math.max(0.2, floorHeight - 0.2);
      const yCenter = yBottom + 0.2 + segmentHeight / 2; // +0.2 to account for slab thickness gap
      const floorFactor = 1 - 0.3 * (yi / Math.max(1, floors - 1));
      for (let xi = 0; xi < xPositions.length; xi++) {
        for (let zi = 0; zi < zPositions.length; zi++) {
          const x = xPositions[xi];
          const z = zPositions[zi];

          // --- LOGIC: SKIP COLUMNS ADJACENT TO CORE (NON-EXPOSED BOUNDARIES) ---
          let shouldSkip = false;
          // Boundary checks are relative to the wing's local (0, 0)
          if (x === 0 && !exposedFaces.includes("left")) shouldSkip = true;
          else if (x === roomWidth && !exposedFaces.includes("right")) shouldSkip = true;
          else if (z === 0 && !exposedFaces.includes("front")) shouldSkip = true;
          else if (z === roomDepth && !exposedFaces.includes("back")) shouldSkip = true;

          if (shouldSkip) {
            continue;
          }
          // --- END SKIP LOGIC ---

          const offset = 0.5; // This offset is confusing, removing to align grid nodes with column centers
          let finalX = x;
          let finalZ = z;
          
          // Re-introducing offset for visual centering IF a column is at the edge.
          // This must be consistent with how the nodeMap is calculated.
          /*
          let finalX = x;
          if (x === 0) finalX += offset;
          else if (x === roomWidth) finalX -= offset;

          let finalZ = z;
          if (z === 0) finalZ += offset;
          else if (z === roomDepth) finalZ -= offset;
          */

          const minRCWidth = RC_MIN_CLAMP_BASE * floorFactor;
          const minSteelWidth = STEEL_MIN_CLAMP_BASE * floorFactor;

          let baseWidth = isSteelColumn
            ? Math.max(minSteelWidth, (floors * floorHeight / 240) * floorFactor)
            : Math.max(minRCWidth, (0.06 + 0.03 * Math.sqrt(floors)) * floorFactor);

          arr.push({
            pos: [finalX, yCenter, finalZ],
            width: baseWidth,
            height: segmentHeight,
            type: isSteelColumn ? "steel" : "rc",
            gridX: finalX,
            gridZ: finalZ,
            storey: yi
          });
        }
      }
    }

    // nodeMap: Includes all internal grid points PLUS the positions of all non-skipped perimeter columns (corners).
    const nodeMapLocal = {};
    for (let yi = 0; yi <= floors; yi++) {
      const y = yi * floorHeight;
      nodeMapLocal[yi] = xPositions.flatMap(x => zPositions.map(z => {
        // Use the original grid point (x, z) as the node position
        let fx = x;
        let fz = z;
        
        // Skip nodes at the boundary that don't have an exposed face
        let isBoundary = (x === 0 || x === roomWidth || z === 0 || z === roomDepth);
        let hasExposedFace = (x === 0 && exposedFaces.includes("left")) ||
                             (x === roomWidth && exposedFaces.includes("right")) ||
                             (z === 0 && exposedFaces.includes("front")) ||
                             (z === roomDepth && exposedFaces.includes("back"));

        const isInternal = x > 0 && x < roomWidth && z > 0 && z < roomDepth;
        
        // A node exists if it's internal OR if it's a boundary and has an exposed face
        const exists = isInternal || (isBoundary && hasExposedFace);

        return { x: fx, z: fz, pos: [fx, y, fz], exists: exists };
      }).filter(n => n.exists)); // Only keep nodes that exist
    }

    // Recalculate xSet and zSet from the *actual* column positions for beams
    const finalXSet = Array.from(new Set(arr.map(c => c.gridX))).sort((a,b)=>a-b);
    const finalZSet = Array.from(new Set(arr.map(c => c.gridZ))).sort((a,b)=>a-b);
    
    // Add the boundary nodes (0 and roomWidth/roomDepth) back IF they are used by columns.
    // The previous logic was slightly incorrect as it was checking against column `gridX/Z` which
    // were just the grid positions. The current `nodeMap` filter is the correct way to handle this.
    
    // Let's use the nodeMap for XSet/ZSet to ensure consistency with panels/bracing
    const perimeterNodes = nodeMapLocal[0]; // Check first floor nodes (all floors should have the same set)
    const finalXSetFromNodes = Array.from(new Set(perimeterNodes.map(n => n.x))).sort((a,b)=>a-b);
    const finalZSetFromNodes = Array.from(new Set(perimeterNodes.map(n => n.z))).sort((a,b)=>a-b);

    return {
      columns: arr,
      xSet: finalXSetFromNodes, // Use nodeMap derived sets
      zSet: finalZSetFromNodes, // Use nodeMap derived sets
      nodeMap: nodeMapLocal
    };
  }, [roomWidth, roomDepth, floors, floorHeight, maxSpan, structuralType, exposedFaces]);

  // Beams (Logic uses the filtered xSet/zSet and all floor positions)
  const beams = useMemo(() => {
    const arr = [];
    // Beams are typically placed at the top of the column/bottom of the slab
    // The previous Y position was `floorHeight + k * floorHeight` which is one floor *too high*.
    // Should be `k * floorHeight + floorHeight` for the *top* of the column segment.
    const yPositions = Array.from({ length: floors }, (_, k) => (k + 1) * floorHeight);
    const currentXSet = xSet;
    const currentZSet = zSet;

    for (let y of yPositions) {
        if (structuralType === "rc") {
            for (let zi of currentZSet)
                for (let xi = 0; xi < currentXSet.length - 1; xi++)
                    arr.push({ start: [currentXSet[xi], y, zi], end: [currentXSet[xi + 1], y, zi], role: "main", y });
            for (let xi of currentXSet)
                for (let zi = 0; zi < currentZSet.length - 1; zi++)
                    arr.push({ start: [xi, y, currentZSet[zi]], end: [xi, y, currentZSet[zi + 1]], role: "secondary", y });
        } else if (structuralType === "pt") {
            // Post-tensioned logic remains the same (band beams along the full span)
            if (currentXSet.length > 1) {
                for (let zi of currentZSet)
                    arr.push({ start: [currentXSet[0], y, zi], end: [currentXSet[currentXSet.length - 1], y, zi], role: "band", y });
            }
            if (currentZSet.length > 1) {
                for (let xi of currentXSet)
                    arr.push({ start: [xi, y, currentZSet[0]], end: [xi, y, currentZSet[currentZSet.length - 1]], role: "band", y });
            }
        } else if (structuralType === "steel") {
            for (let zi of currentZSet)
                for (let xi = 0; xi < currentXSet.length - 1; xi++)
                    arr.push({ start: [currentXSet[xi], y, zi], end: [currentXSet[xi + 1], y, zi], role: "main", y });
            // Simplified secondary beam placement for steel...
        }
    }
    return arr;
  }, [xSet, zSet, floors, floorHeight, structuralType]);

  // Floor Slabs
  const SLAB_THICKNESS = structuralType === "pt" ? 0.3 : 0.2;
  const floorsData = useMemo(() => generateFloors(floors, roomWidth, roomDepth, floorHeight, SLAB_THICKNESS), [floors, roomWidth, roomDepth, floorHeight, SLAB_THICKNESS]);

  // Helper to gather panel corners for a face and a story (FIXED FOR MEGA-BAYS)
  const getPanelsForFaceAtStorey = (face, yi) => {
    // nodeMap is keyed by yi (story index), with floor 0 being yi=0 and top of building being yi=floors
    const lowerNodes = nodeMap[yi];
    const upperNodes = nodeMap[yi + 1];
    if (!lowerNodes || !upperNodes) return [];

    // The boundary nodes for a wing are at X=0, X=roomWidth, Z=0, Z=roomDepth
    // The previous logic used an `offset = 0.5` in column/node map calculation
    // which seems wrong for a wing's local coordinate system. I've corrected the nodeMap logic.

    const getNodesOnFace = (nodes, axis, val, sortAxis) => nodes
        .filter(n => Math.abs(n[axis] - val) < 1e-3)
        .sort((a,b)=> (sortAxis === 'x' ? a.x - b.x : a.z - b.z));

    let faceNodesLower, faceNodesUpper;
    let panels = [];

    // The boundary is now 0 or roomWidth/roomDepth, without the confusing offset
    if (face === "front") {
      const zVal = 0;
      faceNodesLower = getNodesOnFace(lowerNodes, 'z', zVal, 'x');
      faceNodesUpper = getNodesOnFace(upperNodes, 'z', zVal, 'x');
    } else if (face === "back") {
      const zVal = roomDepth;
      faceNodesLower = getNodesOnFace(lowerNodes, 'z', zVal, 'x');
      faceNodesUpper = getNodesOnFace(upperNodes, 'z', zVal, 'x');
    } else if (face === "left") {
      const xVal = 0;
      faceNodesLower = getNodesOnFace(lowerNodes, 'x', xVal, 'z');
      faceNodesUpper = getNodesOnFace(upperNodes, 'x', xVal, 'z');
    } else if (face === "right") {
      const xVal = roomWidth;
      faceNodesLower = getNodesOnFace(lowerNodes, 'x', xVal, 'z');
      faceNodesUpper = getNodesOnFace(upperNodes, 'x', xVal, 'z');
    }

    // NEW PANEL GENERATION LOGIC: Spans between all existing nodes on the perimeter (now mega-bays)
    for (let i = 0; i < faceNodesLower.length - 1; i++) {
        panels.push({
            aLower: faceNodesLower[i],
            bLower: faceNodesLower[i+1],
            aUpper: faceNodesUpper[i],
            bUpper: faceNodesUpper[i+1]
        });
    }

    return panels;
  };

  const bracingFacesToApply = useMemo(() => {
    if (!applyAllSides) {
      const isXLonger = roomWidth >= roomDepth;
      const mainFaces = isXLonger ? ["front", "back"] : ["left", "right"];
      return mainFaces.filter(face => exposedFaces.includes(face));
    }
    return exposedFaces;
  }, [applyAllSides, roomWidth, roomDepth, exposedFaces]);

  const bracingLines = useMemo(() => {
    if (!bracingType) return [];
    const lines = [];
    const storyCount = floors;
    for (let yi = 0; yi < storyCount; yi++) {
      if (bracingType === "belt") continue;
      for (let face of bracingFacesToApply) {
        const panels = getPanelsForFaceAtStorey(face, yi);
        if (!panels.length) continue;
        for (let pIndex = 0; pIndex < panels.length; pIndex++) {
          const panel = panels[pIndex];
          const { aLower, bLower, aUpper, bUpper } = panel;
          const lowA = aLower.pos, lowB = bLower.pos, upA = aUpper.pos, upB = bUpper.pos;
          // Bracing logic here remains the same, applied to the mega-bay panel
          if (bracingType === "x") {
            lines.push({ start: lowA, end: upB });
            lines.push({ start: lowB, end: upA });
          } else if (bracingType === "chevron") {
            const midPoint = [ (upA[0] + upB[0]) / 2, (upA[1] + upB[1]) / 2, (upA[2] + upB[2]) / 2 ];
            lines.push({ start: lowA, end: midPoint });
            lines.push({ start: lowB, end: midPoint });
          } else if (bracingType === "alternating") {
            const flip = (yi % 2 === 0) ? (pIndex % 2 === 0) : (pIndex % 2 !== 0);
            if (flip) lines.push({ start: lowA, end: upB });
            else lines.push({ start: lowB, end: upA });
          }
        }
      }
    }
    return lines;
  }, [bracingType, bracingFacesToApply, floors, nodeMap]);

  const beltBoxes = useMemo(() => {
    if (bracingType !== "belt") return [];
    const boxes = [];
    const beltFloorInterval = Math.max(1, Math.floor(Math.max(4, floors / 4)));
    const beltThickness = 1;
    const beltDepth = 0.4;
    const W = roomWidth, D = roomDepth;

    for (let yi = beltFloorInterval - 1; yi < floors; yi += beltFloorInterval) {
      // The belt is centered on the floor level *above* the columns it sits on
      const y = (yi + 1) * floorHeight - floorHeight / 2;
      const wallOffset = 0.05; // Visual offset for belt from boundary

      if (exposedFaces.includes("front")) boxes.push({ pos: [W / 2, y, 0 + wallOffset], args: [W, beltThickness, beltDepth] });
      if (exposedFaces.includes("back")) boxes.push({ pos: [W / 2, y, D - wallOffset], args: [W, beltThickness, beltDepth] });
      if (exposedFaces.includes("left")) boxes.push({ pos: [0 + wallOffset, y, D / 2], args: [beltDepth, beltThickness, D] });
      if (exposedFaces.includes("right")) boxes.push({ pos: [W - wallOffset, y, D / 2], args: [beltDepth, beltThickness, D] });
    }
    return boxes;
  }, [bracingType, floors, floorHeight, roomWidth, roomDepth, exposedFaces]);

  const glassPanels = useMemo(() => {
    if (!showGlass) return [];
    const panels = [];
    const wallThickness = 0.02; // Make it thinner
    const wallHeight = floorHeight - SLAB_THICKNESS;
    const yOffset = SLAB_THICKNESS / 2 + wallHeight / 2;

    for (let yi = 0; yi < floors; yi++) {
      for (let face of exposedFaces) {
        const facePanels = getPanelsForFaceAtStorey(face, yi);
        for (let panel of facePanels) {
          const { aLower, bLower } = panel;

          let center, sizeArgs;

          if (face === "front" || face === "back") {
            const xLength = Math.abs(bLower.x - aLower.x);
            const xCenter = (aLower.x + bLower.x) / 2;
            const zCoord = aLower.z;
            center = [xCenter, yi * floorHeight + yOffset, zCoord];
            sizeArgs = [xLength, wallHeight, wallThickness];
          } else {
            const zLength = Math.abs(bLower.z - aLower.z);
            const zCenter = (aLower.z + bLower.z) / 2;
            const xCoord = aLower.x;
            center = [xCoord, yi * floorHeight + yOffset, zCenter];
            sizeArgs = [wallThickness, wallHeight, zLength];
          }

          panels.push({ pos: center, args: sizeArgs });
        }
      }
    }
    return panels;
  }, [showGlass, floors, floorHeight, SLAB_THICKNESS, nodeMap, exposedFaces]);


  return (
    <group position={[-roomWidth / 2, 0, -roomDepth / 2]}>
      {/* INSTANCED VISUALS */}
      <InstancedFloors items={floorsData} color={floorColor} />
      <InstancedColumns items={columns} />
      <BeamVisuals beams={beams} />

      {/* Bracing */}
      <InstancedBracingLines items={bracingLines} />
      <InstancedMeshGeneric items={beltBoxes} color={"#ff0000"} />

      {/* Glass */}
      <InstancedGlassPanels items={glassPanels} />

      {/* RAPPIER PHYSICS COLLIDERS */}
      {/* Floor Colliders */}
      {floorsData.map((floor, i) => (
        <RigidBody key={`floor-${i}`} type="fixed" position={floor.pos}>
          <CuboidCollider args={[floor.args[0] / 2, floor.args[1] / 2, floor.args[2] / 2]} />
        </RigidBody>
      ))}
      {/* Column Colliders */}
      {columns.map((col, i) => (
        <RigidBody key={`col-${i}`} type="fixed" position={col.pos}>
          <CuboidCollider args={[col.width/2, col.height/2, col.width/2]} />
        </RigidBody>
      ))}
    </group>
  );
}

// =============================================================
//  RECTANGULAR LAYOUT GENERATOR (FINAL VERSION)
// =============================================================

export function ProceduralRectangularLayout({
  buildingWidth = 25,
  buildingDepth = 25,
  floors = 20,
  floorHeight = 3.5,
  core_x_span = 5,
  core_z_span = 5,
  core_wall_thickness = 1,
  selectedCode = "US",
  bracingType = "belt",
  applyAllSides = true,
  showGlass = true,
}) {

    // --- 1. Calculate Fractional Wing Dimensions ---
    const wingWidth = (buildingWidth - core_x_span) / 2;
    const wingDepth = (buildingDepth - core_z_span) / 2;

    if (wingWidth <= 0 || wingDepth <= 0) {
      console.error(
        `❌ Wing dimensions must be positive. Total dimensions (${buildingWidth}x${buildingDepth}) must be larger than core dimensions (${core_x_span}x${core_z_span}).`
      );
      return null;
    }

    const W_CORNER = wingWidth;
    const D_CORNER = wingDepth;
    const W_SIDE_Z = core_x_span;
    const D_SIDE_Z = wingDepth;
    const W_SIDE_X = wingWidth;
    const D_SIDE_X = core_z_span;
// --- 2. Core walls (Individual Meshes for better memory use on 4 walls) ---
  const coreWalls = useMemo(() => {
    const H = floors * floorHeight;
    const y = H / 2;
    // IMPORTANT: Core wall arguments must be stored in the layout structure!
    return [
      // Front/Back walls (run along X-axis, centered at Z +/- core_z_span/2)
      { pos: [0, y, core_z_span / 2], args: [core_x_span, H, core_wall_thickness] },
      { pos: [0, y, -core_z_span / 2], args: [core_x_span, H, core_wall_thickness] },
      // Left/Right walls (run along Z-axis, centered at X +/- core_x_span/2)
      { pos: [core_x_span / 2, y, 0], args: [core_wall_thickness, H, core_z_span] },
      { pos: [-core_x_span / 2, y, 0], args: [core_wall_thickness, H, core_z_span] },
    ];
  }, [floors, floorHeight, core_x_span, core_z_span, core_wall_thickness]);

  // --- 3. Buildings layout: Jigsaw calculation (No change) ---
  const layouts = useMemo(() => {
    const arr = [];

    const offsetX_C = core_x_span / 2 + W_CORNER / 2;
    const offsetZ_C = core_z_span / 2 + D_CORNER / 2;

    const offsetX_S = core_x_span / 2 + W_SIDE_X / 2;
    const offsetZ_S = core_z_span / 2 + D_SIDE_Z / 2;

    // Corner Wings (4) - 2 Exposed Faces
    arr.push({ pos: [offsetX_C, 0, offsetZ_C], width: W_CORNER, depth: D_CORNER, exposedFaces: ["back"] });
    arr.push({ pos: [-offsetX_C, 0, offsetZ_C], width: W_CORNER, depth: D_CORNER, exposedFaces: ["back"] });
    arr.push({ pos: [-offsetX_C, 0, -offsetZ_C], width: W_CORNER, depth: D_CORNER, exposedFaces: ["front"] });
    arr.push({ pos: [offsetX_C, 0, -offsetZ_C], width: W_CORNER, depth: D_CORNER, exposedFaces: ["front"] });

    // Side Wings (4) - 1 Exposed Face
    arr.push({ pos: [offsetX_S, 0, 0], width: W_SIDE_X, depth: D_SIDE_X, exposedFaces: [] });
    arr.push({ pos: [-offsetX_S, 0, 0], width: W_SIDE_X, depth: D_SIDE_X, exposedFaces: [] });
    arr.push({ pos: [0, 0, offsetZ_S], width: W_SIDE_Z, depth: D_SIDE_Z, exposedFaces: ["back"] });
    arr.push({ pos: [0, 0, -offsetZ_S], width: W_SIDE_Z, depth: D_SIDE_Z, exposedFaces: ["front"] });

    return arr;
  }, [core_x_span, core_z_span, W_CORNER, D_CORNER, W_SIDE_X, D_SIDE_X, W_SIDE_Z, D_SIDE_Z]);

  // --- 4. Render ---
  return (
    <group position={[0, -floorHeight / 2, 0]}>

      {/* Render Core Visuals (Individual Mesh) */}
      <CoreWallIndividual items={coreWalls} />

      {/* Render Core Details (Doors and Stairs) */}
      <CoreDetails
          coreWalls={coreWalls}
          floors={floors}
          floorHeight={floorHeight}
      />

      {/* Core Colliders (map remains the same) */}
      {coreWalls.map((wall, i) => (
        <RigidBody key={`core-${i}`} type="fixed" position={wall.pos}>
          <CuboidCollider args={[wall.args[0] / 2, wall.args[1] / 2, wall.args[2] / 2]} />
        </RigidBody>
      ))}

      {/* Render 8 Jigsaw Buildings (Wings) (map remains the same) */}
      {layouts.map((b, i) => (
        <group key={i} position={b.pos}>
          <ProceduralBuilding
            floors={floors}
            roomWidth={b.width}
            roomDepth={b.depth}
            floorHeight={floorHeight}
            selectedCode={selectedCode}
            bracingType={bracingType}
            applyAllSides={applyAllSides}
            showGlass={showGlass}
            exposedFaces={b.exposedFaces}
          />
        </group>
      ))}
    </group>
  );
}