import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Line, Cylinder, Sphere } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';

// --- CONSTANTS ---
const ROAD_WIDTH = 30;
const LANE_WIDTH = ROAD_WIDTH / 4;
const ROAD_LENGTH = 300;
const INTERSECTION_SIZE = 24;
const CAR_SPEED = 18;
const PED_SPEED = 3;
const ROTATION_SPEED = 8;
const NODE_THRESHOLD = 1.5;
const CYCLE_DURATION = { green: 8, yellow: 3 };

// --- NODE SYSTEM ---
const NODES = {
  N_IN: [LANE_WIDTH * 0.5 * .9, 0.2, ROAD_LENGTH / 2 * .9],
  S_IN: [-LANE_WIDTH * 0.5 * .9, 0.2, -ROAD_LENGTH / 2 * .9],
  E_IN: [ROAD_LENGTH / 2 * .9, 0.2, LANE_WIDTH * 0.5 * .9],
  W_IN: [-ROAD_LENGTH / 2 * .9, 0.2, -LANE_WIDTH * 0.5 * .9],
  N_STOP: [LANE_WIDTH * 0.5, 0, INTERSECTION_SIZE / 2],
  S_STOP: [-LANE_WIDTH * 0.5, 0, -INTERSECTION_SIZE / 2],
  E_STOP: [INTERSECTION_SIZE / 2, 0, LANE_WIDTH * 0.5],
  W_STOP: [-INTERSECTION_SIZE / 2, 0, -LANE_WIDTH * 0.5],
  N_EXIT: [-LANE_WIDTH * 0.5, 0, INTERSECTION_SIZE / 2],
  S_EXIT: [LANE_WIDTH * 0.5, 0, -INTERSECTION_SIZE / 2],
  E_EXIT: [INTERSECTION_SIZE / 2, 0, -LANE_WIDTH * 0.5],
  W_EXIT: [-INTERSECTION_SIZE / 2, 0, LANE_WIDTH * 0.5],
  N_OUT: [-LANE_WIDTH * 0.5, 0, ROAD_LENGTH / 2 * .9],
  S_OUT: [LANE_WIDTH * 0.5, 0, -ROAD_LENGTH / 2 * .9],
  E_OUT: [ROAD_LENGTH / 2 * .9, 0, -LANE_WIDTH * 0.5],
  W_OUT: [-ROAD_LENGTH / 2 * .9, 0, LANE_WIDTH * 0.5],
};

const ROUTES = {
  N: { stop: 'N_STOP', group: 'N', intents: { straight: 'S_EXIT', left: 'E_EXIT', right: 'W_EXIT' } },
  S: { stop: 'S_STOP', group: 'S', intents: { straight: 'N_EXIT', left: 'W_EXIT', right: 'E_EXIT' } },
  E: { stop: 'E_STOP', group: 'E', intents: { straight: 'W_EXIT', left: 'S_EXIT', right: 'N_EXIT' } },
  W: { stop: 'W_STOP', group: 'W', intents: { straight: 'E_EXIT', left: 'N_EXIT', right: 'S_EXIT' } },
};

const getDistance = (p1, p2) => Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[2] - p2[2]) ** 2);
const TrafficLight = ({ position, rotation, state }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    
    <Cylinder
      args={[0.2, 0.25, 8]}
      position={[0, 4, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#222" metalness={0.8} />
    </Cylinder>

    <Cylinder
      args={[0.15, 0.15, 4]}
      position={[1.8, 7.5, 0]}
      rotation={[0, 0, Math.PI / 2]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#222" />
    </Cylinder>

    <mesh position={[3.5, 7.5, 0.4]} castShadow receiveShadow>
      <boxGeometry args={[1.2, 3, 0.8]} />
      <meshStandardMaterial color="#111" />

      <Sphere args={[0.35, 16, 16]} position={[0, 0.8, 0.1]} castShadow>
        <meshStandardMaterial
          color="red"
          emissive="red"
          emissiveIntensity={state === 'red' ? 10 : 0.1}
          transparent
          opacity={state === 'red' ? 1 : 0.2}
        />
      </Sphere>

      <Sphere args={[0.35, 16, 16]} position={[0, 0, 0.1]} castShadow>
        <meshStandardMaterial
          color="yellow"
          emissive="yellow"
          emissiveIntensity={state === 'yellow' ? 10 : 0.1}
          transparent
          opacity={state === 'yellow' ? 1 : 0.2}
        />
      </Sphere>

      <Sphere args={[0.35, 16, 16]} position={[0, -0.8, 0.1]} castShadow>
        <meshStandardMaterial
          color="#00ff00"
          emissive="#00ff00"
          emissiveIntensity={state === 'green' ? 10 : 0.1}
          transparent
          opacity={state === 'green' ? 1 : 0.2}
        />
      </Sphere>
    </mesh>
  </group>
);

const Pedestrian = ({ id, startPos, endPos, color, onRemove }) => {
  const ref = useRef();
  useFrame(() => {
    if (!ref.current) return;
    const pos = ref.current.translation();
    const dist = getDistance([pos.x, 0, pos.z], endPos);
    if (dist < 1.2) { onRemove(id); return; }
    const dir = new THREE.Vector3(endPos[0] - pos.x, 0, endPos[2] - pos.z).normalize();
    ref.current.setLinvel({ x: dir.x * PED_SPEED, y: 0, z: dir.z * PED_SPEED }, true);
  });
  return (
    <RigidBody ref={ref} position={startPos} type="dynamic" colliders="cuboid" lockRotations>
      <mesh castShadow position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.3, 1, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
};const Vehicle = ({ id, path, color, onRemove, trafficStates, group, isTurningLeft, isTurningRight }) => {
  const rigidBody = useRef();
  const [targetNodeIdx, setTargetNodeIdx] = useState(1);
  const [isBlocked, setBlocked] = useState(false);
  const [blink, setBlink] = useState(false);

  // --- 1. PROPERLY SCOPED TEXTURE ---
  const vehicleTexture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Fill Base Color (The prop passed to the car)
    ctx.fillStyle = color; 
    ctx.fillRect(0, 0, size, size);

    // Add high-contrast features for the Stereo Shader
    // A white/black noise pattern is best for SAD matching
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const s = Math.random() * 2 + 1;
      // Use "Screen" or "Overlay" style speckles
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
      ctx.fillRect(x, y, s, s);
    }

    // Add a subtle tech-grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    for (let i = 0; i < size; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true; // Force upload to GPU
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, [color]); // CRITICAL: Updates when the car color changes

  useEffect(() => {
    const interval = setInterval(() => setBlink((prev) => !prev), 500);
    return () => clearInterval(interval);
  }, []);

  useFrame((state, delta) => {
    if (!rigidBody.current) return;
    const currentPos = rigidBody.current.translation();
    const targetNode = NODES[path[targetNodeIdx]];
    const distToTarget = getDistance([currentPos.x, 0, currentPos.z], targetNode);

    if (distToTarget < NODE_THRESHOLD) {
      if (targetNodeIdx < path.length - 1) setTargetNodeIdx(targetNodeIdx + 1);
      else onRemove(id);
    }

    let speedMultiplier = 1;
    if (path[targetNodeIdx].includes('STOP') && trafficStates[group] !== 'green' && distToTarget < 6) speedMultiplier = 0;
    if (isBlocked) speedMultiplier = 0;

    const targetVec = new THREE.Vector3(targetNode[0] - currentPos.x, 0, targetNode[2] - currentPos.z).normalize();
    if (speedMultiplier > 0) {
      const targetAngle = Math.atan2(targetVec.x, targetVec.z);
      const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
      rigidBody.current.setRotation(new THREE.Quaternion().copy(rigidBody.current.rotation()).slerp(targetQuat, delta * ROTATION_SPEED), true);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rigidBody.current.rotation());
      rigidBody.current.setLinvel({ x: forward.x * CAR_SPEED, y: 0, z: forward.z * CAR_SPEED }, true);
    } else {
      rigidBody.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody ref={rigidBody} position={NODES[path[0]]} type="dynamic" colliders={false}>
      <CuboidCollider args={[1.1, 0.6, 2.1]} />
      <CuboidCollider 
        args={[0.8, 0.5, 1.2]} 
        position={[0, 0, 3.2]} 
        sensor 
        onIntersectionEnter={() => setBlocked(true)} 
        onIntersectionExit={() => setBlocked(false)} 
      />
      
      <group>
        {/* Main Body - Note: color={color} removed to let texture define color */}
        <mesh castShadow position={[0, 0.6, 0]}>
          <boxGeometry args={[2.2, 1.2, 4.2]} />
          <meshStandardMaterial 
            map={vehicleTexture} 
            roughness={0.8} 
            metalness={0.1} 
          />
        </mesh>
        
        {/* Cabin */}
        <mesh position={[0, 1.3, 0.2]}>
          <boxGeometry args={[1.8, 0.8, 2.0]} />
          <meshStandardMaterial color="#151515" map={vehicleTexture} roughness={1} />
        </mesh>

        {/* Headlights */}
        <mesh position={[-0.7, 0.6, 2.11]}>
          <boxGeometry args={[0.5, 0.3, 0.1]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
        </mesh>
        <mesh position={[0.7, 0.6, 2.11]}>
          <boxGeometry args={[0.5, 0.3, 0.1]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
        </mesh>

        {/* Taillights */}
        <mesh position={[-0.7, 0.6, -2.11]}>
          <boxGeometry args={[0.5, 0.3, 0.1]} />
          <meshStandardMaterial color="#800000" emissive="red" emissiveIntensity={isBlocked ? 5 : 1} />
        </mesh>
        <mesh position={[0.7, 0.6, -2.11]}>
          <boxGeometry args={[0.5, 0.3, 0.1]} />
          <meshStandardMaterial color="#800000" emissive="red" emissiveIntensity={isBlocked ? 5 : 1} />
        </mesh>

        {/* Blinkers */}
        <mesh position={[-1.0, 0.6, 2.11]}>
          <boxGeometry args={[0.2, 0.2, 0.1]} />
          <meshStandardMaterial color="orange" emissive="orange" emissiveIntensity={isTurningLeft && blink ? 3 : 0} />
        </mesh>
        <mesh position={[1.0, 0.6, 2.11]}>
          <boxGeometry args={[0.2, 0.2, 0.1]} />
          <meshStandardMaterial color="orange" emissive="orange" emissiveIntensity={isTurningRight && blink ? 3 : 0} />
        </mesh>
      </group>
    </RigidBody>
  );
};

const ZebraCrossing = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {[...Array(6)].map((_, i) => (
      <mesh key={i} position={[(i - 2.5) * 2.5, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 8]} />
        <meshStandardMaterial color="white" polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    ))}
  </group>
);

// --- MAIN COMPONENT ---
export function Intersection() {
  const [trafficStates, setTrafficStates] = useState({ N: 'green', S: 'red', E: 'red', W: 'red' });
  const [vehicles, setVehicles] = useState([]);
  const [peds, setPeds] = useState([]);
  const nextId = useRef(0);
  const spawnTimer = useRef({ car: 0, ped: 0 });

  useEffect(() => {
    const sequence = ['N', 'E', 'S', 'W'];
    let idx = 0, yellow = false;
    const tick = () => {
      const cur = sequence[idx];
      if (!yellow) { setTrafficStates(p => ({ ...p, [cur]: 'yellow' })); yellow = true; setTimeout(tick, CYCLE_DURATION.yellow * 1000); }
      else { yellow = false; idx = (idx + 1) % 4; setTrafficStates({ N: 'red', S: 'red', E: 'red', W: 'red', [sequence[idx]]: 'green' }); setTimeout(tick, CYCLE_DURATION.green * 1000); }
    };
    const t = setTimeout(tick, CYCLE_DURATION.green * 1000);
    return () => clearTimeout(t);
  }, []);

  useFrame((state, delta) => {
    spawnTimer.current.car += delta;
    spawnTimer.current.ped += delta;
    if (spawnTimer.current.car > 4 && vehicles.length < 18) {
      spawnTimer.current.car = 0;
      const keys = ['N', 'S', 'E', 'W'], start = keys[Math.floor(Math.random() * 4)], route = ROUTES[start];
      const exit = route.intents[['straight', 'straight', 'left', 'right'][Math.floor(Math.random() * 4)]];
      setVehicles(v => [...v, { id: nextId.current++, path: [start + '_IN', route.stop, exit, exit.replace('EXIT', 'OUT')], group: start, color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5) }]);
    }
    if (spawnTimer.current.ped > 4.5 && peds.length < 8) {
      spawnTimer.current.ped = 0;
      const offset = Math.random() > 0.5 ? 85 : -85;
      const horizontal = Math.random() > 0.5;
      const startSide = Math.random() > 0.5 ? 14 : -14;
      const startPos = horizontal ? [startSide, 1, offset] : [offset, 1, startSide];
      const endPos = horizontal ? [-startSide, 0, offset] : [offset, 0, -startSide];
      setPeds(p => [...p, { id: nextId.current++, startPos, endPos, color: "#e67e22" }]);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[100, 50, 100]} intensity={1.5} distance={10000} castShadow />

      {/* Main Level Surface */}
    <RigidBody type="fixed">
      <mesh rotation={[-Math.PI / 2,0,0]} receiveShadow>
        <planeGeometry args={[1000,1000]} />
        <meshStandardMaterial color="#4a703b" />
      </mesh>
      <CuboidCollider args={[500,0.1,500]} position={[0,-0.1,0]} />
    </RigidBody>

    <group>
      <RigidBody type="fixed">
        <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.1,0]} receiveShadow>
          <planeGeometry args={[ROAD_WIDTH,ROAD_LENGTH]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        <CuboidCollider args={[ROAD_WIDTH/2,0.05,ROAD_LENGTH/2*0.9]} />
      </RigidBody>

      <RigidBody type="fixed">
        <mesh rotation={[-Math.PI/2,0,Math.PI/2]} position={[0,0.1,0]} receiveShadow>
          <planeGeometry args={[ROAD_WIDTH,ROAD_LENGTH]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        <CuboidCollider args={[ROAD_LENGTH/2*0.9,0.05,ROAD_WIDTH/2]} />
      </RigidBody>
    </group>



      <ZebraCrossing position={[0, 0.02, 85]} />
      <ZebraCrossing position={[0, 0.02, -85]} />
      <ZebraCrossing position={[85, 0.02, 0]} rotation={Math.PI/2} />
      <ZebraCrossing position={[-85, 0.02, 0]} rotation={Math.PI/2} />

      <TrafficLight position={[-ROAD_WIDTH*.6, 0, ROAD_WIDTH*.7]} rotation={0} state={trafficStates.N} />
      <TrafficLight position={[ROAD_WIDTH*.6, 0, -ROAD_WIDTH*.7]} rotation={Math.PI} state={trafficStates.S} />
      <TrafficLight position={[ROAD_WIDTH*.7, 0, ROAD_WIDTH*.6]} rotation={Math.PI / 2} state={trafficStates.E} />
      <TrafficLight position={[-ROAD_WIDTH*.7, 0, -ROAD_WIDTH*.6]} rotation={-Math.PI / 2} state={trafficStates.W} />

      {vehicles.map(v => <Vehicle key={v.id} {...v} trafficStates={trafficStates} onRemove={id => setVehicles(p => p.filter(veh => veh.id !== id))} />)}
      {peds.map(p => <Pedestrian key={p.id} {...p} onRemove={id => setPeds(v => v.filter(pd => pd.id !== id))} />)}
    </>
  );
}