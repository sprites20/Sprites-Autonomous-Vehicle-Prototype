import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars, MeshDistortMaterial } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const CONFIG = {
  moonColor: '#e0ffff',
  glowColor: '#00ffff',
  fogColor: '#000814',
  flowerCount: 5000,
  vineCount: 0,
  leafPerVine: 10,
  grassCount: 100000,
  petalCount: 200,
};

// --- OPTIMIZED INSTANCED COMPONENTS ---

/**
 * Optimized Grass: Uses a single draw call for 50k instances.
 */
function PointyGrass() {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const grassData = useMemo(() => {
    return Array.from({ length: CONFIG.grassCount }, () => ({
      pos: [(Math.random() - 0.5) * 80, -1.5, (Math.random() - 0.5) * 80],
      scale: 0.2 + Math.random() * 0.4,
      speed: 0.5 + Math.random() * 1.5,
      offset: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    grassData.forEach((data, i) => {
      const { pos, scale, speed, offset } = data;
      dummy.position.set(...pos);
      // Faster swaying math
      dummy.rotation.set(Math.sin(t * speed + offset) * 0.1, offset, 0);
      dummy.scale.set(0.06, scale, 0.06);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, CONFIG.grassCount]}>
      <coneGeometry args={[1, 1, 3]} />
      <meshStandardMaterial 
        color="#002222" 
        emissive="#1a3a3a" 
        emissiveIntensity={1.2} 
        roughness={0.5} 
      />
    </instancedMesh>
  );
}

/**
 * Optimized Flower Field: Replaces 5,000 groups with 1 instancedMesh.
 * Each "instance" here represents one petal. (Total instances = Count * Petals)
 */
function FlowerField() {
  const meshRef = useRef();
  const petalsPerFlower = 5;
  const totalPetals = CONFIG.flowerCount * petalsPerFlower;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const flowerPositions = useMemo(() => {
    return Array.from({ length: CONFIG.flowerCount }, () => ({
      pos: [(Math.random() - 0.5) * 60, -1.48, (Math.random() - 0.5) * 60],
      scale: 0.3 + Math.random() * 0.4,
      rotation: Math.random() * Math.PI,
    }));
  }, []);

  const petalShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.1, 0.1, 0.1, 0.3, 0, 0.4);
    s.bezierCurveTo(-0.1, 0.3, -0.1, 0.1, 0, 0);
    return s;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let idx = 0;
    flowerPositions.forEach((f) => {
      for (let p = 0; p < petalsPerFlower; p++) {
        dummy.position.set(...f.pos);
        // Animate individual flower "opening" or swaying
        const sway = Math.sin(t + f.rotation) * 0.05;
        dummy.rotation.set(0.6 + sway, f.rotation, (p / petalsPerFlower) * Math.PI * 2);
        dummy.scale.setScalar(f.scale);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(idx++, dummy.matrix);
      }
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, totalPetals]}>
      <shapeGeometry args={[petalShape]} />
      <meshBasicMaterial color="#55eaff" transparent opacity={0.6} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/**
 * Optimized Vines: Instances the leaves to avoid unique components.
 */
function HangingVines() {
  const leafRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const vines = useMemo(() => {
    return Array.from({ length: CONFIG.vineCount }, () => {
      const startX = (Math.random() - 0.5) * 50;
      const startZ = (Math.random() - 0.5) * 40;
      const length = 8 + Math.random() * 12;
      const points = [];
      for (let j = 0; j <= 5; j++) {
        points.push(new THREE.Vector3(
          startX + Math.sin(j) * 0.5, 
          15 - (j / 5) * length, 
          startZ + Math.cos(j) * 0.5
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const leaves = Array.from({ length: CONFIG.leafPerVine }, () => ({
        t: Math.random(),
        offset: Math.random() * Math.PI,
        pos: new THREE.Vector3() // placeholder
      }));
      return { curve, leaves };
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let idx = 0;
    vines.forEach(vine => {
      vine.leaves.forEach(leaf => {
        const p = vine.curve.getPoint(leaf.t, leaf.pos);
        dummy.position.copy(p);
        dummy.position.x += Math.sin(t * 0.5 + leaf.offset) * 0.1;
        dummy.rotation.set(0, 0, Math.sin(t + leaf.offset) * 0.2);
        dummy.scale.setScalar(0.4);
        dummy.updateMatrix();
        leafRef.current.setMatrixAt(idx++, dummy.matrix);
      });
    });
    leafRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {vines.map((v, i) => (
        <mesh key={i}>
          <tubeGeometry args={[v.curve, 16, 0.04, 6, false]} />
          <meshStandardMaterial color="#020810" />
        </mesh>
      ))}
      <instancedMesh ref={leafRef} args={[null, null, CONFIG.vineCount * CONFIG.leafPerVine]}>
        <planeGeometry args={[0.4, 0.5]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.4} side={THREE.DoubleSide} />
      </instancedMesh>
    </>
  );
}

// --- CORE SCENE COMPONENTS ---

function Moon() {
  const moonRef = useRef();
  useFrame((t) => {
    const s = 1 + Math.sin(t.clock.elapsedTime * 0.5) * 0.02;
    moonRef.current.scale.setScalar(s);
  });

  return (
    <group position={[0, 5, -25]}>
      <mesh ref={moonRef}>
        <sphereGeometry args={[4, 64, 64]} />
        <meshBasicMaterial color={CONFIG.moonColor} />
      </mesh>
      <pointLight color={CONFIG.glowColor} intensity={5} distance={100} />
      {[1, 1.5, 2].map((s, i) => (
        <Float key={i} speed={s} rotationIntensity={2}>
          <mesh rotation={[Math.PI / i, 0, 0]}>
            <torusGeometry args={[5 + i * 1.5, 0.03, 16, 100]} />
            <meshBasicMaterial color="#88ffff" transparent opacity={0.1} />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function FallingPetals() {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => Array.from({ length: CONFIG.petalCount }, () => ({
    pos: new THREE.Vector3((Math.random() - 0.5) * 60, Math.random() * 25, (Math.random() - 0.5) * 60),
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, -0.03 - Math.random() * 0.05, (Math.random() - 0.5) * 0.05),
    rot: new THREE.Vector3(Math.random(), Math.random(), Math.random())
  })), []);

  useFrame((state) => {
    particles.forEach((p, i) => {
      p.pos.add(p.vel);
      p.rot.x += 0.01;
      if (p.pos.y < -5) p.pos.y = 25;
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      dummy.scale.setScalar(0.15);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, CONFIG.petalCount]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="white" transparent opacity={0.3} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

export const SceneContent = () => {
  return (
    <>
      <color attach="background" args={[CONFIG.fogColor]} />
      <fogExp2 attach="fog" args={[CONFIG.fogColor, 0.015]} />
      
      <ambientLight intensity={0.2} color="#001122" />
      <Moon />
      
        <PointyGrass />
        <FlowerField />
        <HangingVines />
        <FallingPetals />

        <RigidBody type="fixed">
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
            <planeGeometry args={[150, 150]} />
            <MeshDistortMaterial 
              color="#03182c" 
              speed={2} 
              distort={0.05} 
              roughness={0} 
              metalness={1} 
              emissive="#1a1f24"
            />
          </mesh>
        </RigidBody>
      <Stars radius={100} depth={50} count={7000} factor={4} saturation={0} fade speed={1} />
    </>
  );
};