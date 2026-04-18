import { Suspense } from "react";
import {useGLTF, Text, Box } from "@react-three/drei";
import * as THREE from "three";

// --- CORE DIMENSIONS ---
const APARTMENT = {
  width: 8,
  length: 10,
  wallThickness: 0.2,
  wallHeight: 4,
  doorHeight: 2.0,
  doorWidth: 0.9,
};

// --- GLTF MODELS ---
const MODEL_MAP = {
  "Dining Table": "/models/dining_table_glass.glb",
  "Sofa": "/models/sofa.glb",
  "Coffee Table": "/models/vintage_coffee_table_70s_freebie.glb",
  "TV": "/models/television_wall-mounted.glb",
  "Queen Bed": "/models/bed.glb",
  "Wardrobe": "/models/wardrobe.glb",
  "Shower": "/models/shower_cabin.glb",
  "Toilet": "/models/toilet.glb",
  "Kitchen Counter": "/models/wardrobe.glb",
  "Vanity": "/models/wardrobe.glb",
};

// --- Target Dimensions (meters) ---
const MODEL_DIMENSIONS = {
  "Dining Table": { width: 2, height: 1.5, depth: 2.5 },
  "Sofa": { width: 4, height: 0.9, depth: 4 },
  "Coffee Table": { width: 1.2, height: 0.45, depth: 0.7 },
  "TV": { width: 2, height: 1, depth: 1.5 },
  "Queen Bed": { width: 3, height: 1.4, depth: 3 },
  "Wardrobe": { width: 2, height: 1.75, depth: 2 },
  "Shower": { width: 1, height: 2, depth: 1 },
  "Toilet": { width: 1, height: 1, depth: 1 },
  "Kitchen Counter": { width: 0.6, height: 0.9, depth: 2.5 },
  "Vanity": { width: 1.2, height: 0.9, depth: 0.5 },
};

// --- Furniture Placement ---
const FURNITURE = [
  { name: "Kitchen Counter", x: 0.6, z: 1.5, rotation: [0, 0, 0], yOffset: 0 },
  { name: "Dining Table", x: 2, z: 2.5, rotation: [0, 0, 0], yOffset: 0 },
  { name: "Sofa", x: 6.5, z: 3, rotation: [0, -Math.PI / 2, 0], yOffset: -0.5 },
  { name: "Coffee Table", x: 6.5, z: 1.5, rotation: [0, 0, 0], yOffset: 0 },
  { name: "TV", x: 6.5, z: 0.2, rotation: [0, 0, 0], yOffset: 0 },
  { name: "Queen Bed", x: 2.7, z: 8.8, rotation: [0, -Math.PI / 2, 0], yOffset: -0.5 },
  { name: "Wardrobe", x: 0.6, z: 9, rotation: [0, Math.PI / 2, 0], yOffset: -.75 },
  { name: "Vanity", x: 5.5, z: 6.2, rotation: [0, 0, 0], yOffset: 0 },
  { name: "Toilet", x: 8, z: 6.2, rotation: [0, -Math.PI / 2, 0], yOffset: -.6 },
  { name: "Shower", x: 7.9, z: 8.5, rotation: [0, -Math.PI / 2, 0], yOffset: -.8 },
];

// --- Doors ---
const DOORS = [
  //{ x: 4, z: 0.1, width: APARTMENT.doorWidth, height: APARTMENT.doorHeight, rotation: [0, 0, 0] },
  //{ x: 3.8, z: 5.1, width: 0.8, height: APARTMENT.doorHeight, rotation: [0, 0, 0] },
  //{ x: 6.8, z: 5.1, width: 0.8, height: APARTMENT.doorHeight, rotation: [0, 0, 0] },
];

// --- Walls ---
const WALLS = [
  { start: [0, 0], end: [3, 0], color: "#545454" },
  { start: [5, 0], end: [APARTMENT.width, 0], color: "#545454" },
  { start: [0, APARTMENT.length], end: [APARTMENT.width, APARTMENT.length], color: "#545454" },
  { start: [0, 0], end: [0, APARTMENT.length], color: "#545454" },
  { start: [APARTMENT.width, 0], end: [APARTMENT.width, APARTMENT.length], color: "#545454" },
  { start: [0, 5], end: [2.7, 5], color: "#A0A0A0" },
  //{ start: [5, 5], end: [6.3, 5], color: "#A0A0A0" },
  { start: [5.5, 5], end: [APARTMENT.width, 5], color: "#A0A0A0" },
  { start: [4, 5], end: [4, APARTMENT.length], color: "#A0A0A0" },
];

// --- Room Labels ---
const ROOM_LABELS = [
  { text: "MAIN AREA", position: [5, 6.5], size: 0.5 },
  { text: "KITCHEN", position: [1.5, 1.5], size: 0.4 },
  { text: "BEDROOM", position: [2.5, 8], size: 0.5 },
  { text: "BATHROOM", position: [6.5, 7.5], size: 0.4 },
];

// --- Components ---
function RoomLabel({ text, position, size }) {
  return (
    <Text
      position={[position[0], APARTMENT.wallHeight + 0.1, position[1]]}
      fontSize={size}
      color="#222"
      anchorX="center"
      anchorY="middle"
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {text}
    </Text>
  );
}

function Floor() {
  return (
    <Box args={[APARTMENT.width, 0.05, APARTMENT.length]} position={[APARTMENT.width / 2, -0.025, APARTMENT.length / 2]}>
      <meshStandardMaterial color="#f0f0f0" />
    </Box>
  );
}

function FurnitureModel({ name, x, z, rotation, yOffset = 0 }) {
  const { scene } = useGLTF(MODEL_MAP[name]);
  const clonedScene = scene.clone();

  const { scale, yPos } = (() => {
    const target = MODEL_DIMENSIONS[name];
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scaleX = target.width / size.x;
    const scaleY = target.height / size.y;
    const scaleZ = target.depth / size.z;
    const finalScale = Math.min(scaleX, scaleY, scaleZ);
    return { scale: finalScale, yPos: (size.y * finalScale) / 2 + yOffset };
  })();

  return <primitive object={clonedScene} position={[x, yPos, z]} rotation={rotation} scale={[scale, scale, scale]} />;
}

// --- Single Apartment Component with Position/Rotation Props ---
export function ApartmentRoom({ position = [0, 0, 0], rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <Floor />
      {WALLS.map((wall, i) => {
        const length = Math.sqrt((wall.end[0] - wall.start[0]) ** 2 + (wall.end[1] - wall.start[1]) ** 2);
        const angle = Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
        const midX = (wall.start[0] + wall.end[0]) / 2;
        const midZ = (wall.start[1] + wall.end[1]) / 2;
        if (length < 0.01) return null;
        return (
          <Box key={i} args={[length, APARTMENT.wallHeight, APARTMENT.wallThickness]} position={[midX, APARTMENT.wallHeight / 2, midZ]} rotation={[0, -angle, 0]}>
            <meshStandardMaterial color={wall.color} metalness={0.1} roughness={0.9} />
          </Box>
        );
      })}
      {DOORS.map((door, i) => (
        <Box key={i} args={[door.width, door.height, APARTMENT.wallThickness * 1.5]} position={[door.x, door.height / 2, door.z]} rotation={door.rotation}>
          <meshStandardMaterial color="#A52A2A" />
        </Box>
      ))}
      {FURNITURE.map((item, i) => (
        <Suspense key={i} fallback={null}>
          <FurnitureModel {...item} />
        </Suspense>
      ))}
    </group>
  );
}
