import { RigidBody, useSpringJoint } from "@react-three/rapier";
import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { JellyCubeSurfaceMesh } from "./JellyCubeSurfaceMesh"; // Import the new component

// --- Constants ---
const DEFAULT_STIFFNESS = 8000;
const DEFAULT_DAMPING = 50;
const PARTICLE_MASS = 0.1;
const LINEAR_DAMPING = 2;
const ANGULAR_DAMPING = 2;
const RESTITUTION = 0.5;
const FRICTION = 0.8;
const REPULSION_STRENGTH = 0.2;
const MIN_LENGTH_THRESHOLD = 0.0001; // Avoid division by zero for repulsion
const REPEL_UPDATE_INTERVAL = 3; // Update repulsion more frequently (was 4, slightly more responsive)

/**
 * A spring joint between two rigid bodies.
 */
function JointComponent({ bodyA, bodyB, anchorA, anchorB, restLength, stiffness, damping }) {
  // bodyA and bodyB are already refs, so we check their .current property
  // This check is important as refs might not be immediately available
  if (bodyA.current && bodyB.current) {
    useSpringJoint(bodyA, bodyB, [
      anchorA,
      anchorB,
      restLength,
      stiffness,
      damping,
    ]);
  }
  return null;
}

/**
 * JellyCube — a soft body made of spring-connected particles.
 */
export default function JellyCube({
  size = 6,
  spacing = 0.2,
  radius = 0.01,
  color = "salmon",
  initialPosition = new Vector3(0, 5, 0),
  stiffness = DEFAULT_STIFFNESS, // Use default or prop
  damping = DEFAULT_DAMPING, // Use default or prop
}) {
  const particleMap = useRef(new Map());
  const frameCount = useRef(0); // For frame-based updates

  // Wait one frame to let all bodies render before simulation
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setIsReady(true));
    console.log("Jelly Cube loaded");
    return () => cancelAnimationFrame(id);
  }, []);

  // Pre-calculate directions for connecting neighbors
  // These are constant and can be defined once.
  const directions = useMemo(() => [
    // Direct neighbors (face)
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
    // Edge neighbors
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    // Corner neighbors
    [1, 1, 1], [-1, -1, -1],
    [-1, 1, 1], [1, -1, 1], [1, 1, -1],
    [-1, -1, 1], [-1, 1, -1], [1, -1, -1],
  ], []);

  // Pre-calculate pairs for repulsion force application.
  // This memoization avoids recalculating the pairs array on every render.
  const repulsionPairs = useMemo(() => {
    const pairs = [];
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const currentKey = `${x}-${y}-${z}`;
          for (const [dx, dy, dz] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;

            // Ensure neighbor is within bounds and avoid adding duplicate pairs (current, neighbor) and (neighbor, current)
            if (nx >= 0 && ny >= 0 && nz >= 0 && nx < size && ny < size && nz < size) {
              const neighborKey = `${nx}-${ny}-${nz}`;
              // Only add if (currentKey, neighborKey) is lexicographically smaller to avoid duplicates
              if (currentKey < neighborKey) {
                pairs.push([currentKey, neighborKey]);
              }
            }
          }
        }
      }
    }
    return pairs;
  }, [size, directions]); // Dependencies: size and directions

  // Apply repulsion forces in useFrame
  useFrame(() => {
    if (!isReady) return;

    // Optimize repulsion calculation by updating every few frames
    frameCount.current++;
    if (frameCount.current % REPEL_UPDATE_INTERVAL !== 0) {
      return;
    }

    const collisionThreshold = spacing * 0.99; // Particles should not get closer than this
    // Reusing Vector3 instances to avoid unnecessary object creation in the loop
    const distVector = new Vector3();
    const repulsionForceVector = new Vector3();

    for (const [keyA, keyB] of repulsionPairs) {
      const rbA = particleMap.current.get(keyA);
      const rbB = particleMap.current.get(keyB);

      if (!rbA || !rbB) continue;

      const posA = rbA.translation();
      const posB = rbB.translation();

      // Use subVectors to perform subtraction and store in distVector
      distVector.subVectors(posA, posB);
      const length = distVector.length();

      // Apply repulsion if particles are too close but not perfectly overlapping
      if (length < collisionThreshold && length > MIN_LENGTH_THRESHOLD) {
        const forceMagnitude = (collisionThreshold - length) * REPULSION_STRENGTH;
        // Avoid division by zero if length is too small
        if (length === 0) continue;

        // Normalize and scale in place to avoid creating new vectors
        repulsionForceVector.copy(distVector).normalize().multiplyScalar(forceMagnitude);

        // Apply equal and opposite forces
        rbA.addForce(repulsionForceVector, true);
        rbB.addForce(repulsionForceVector.negate(), true); // negate modifies in place
      }
    }
  });

  // Generate spring joints
  const joints = useMemo(() => {
    const components = [];
    const restLength = spacing * 0.6; // Calculate once
    
    // Create pre-calculated anchor vectors to avoid re-creating them in the loop
    const anchorAVector = new Vector3();
    const anchorBVector = new Vector3();

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const currentKey = `${x}-${y}-${z}`;
          // Create a ref object for current particle to pass to JointComponent
          // This creates a closure for currentParticleRef that correctly captures particleMap.current.get(currentKey)
          const currentParticleRef = {
            get current() { return particleMap.current.get(currentKey); }
          };

          for (const [dx, dy, dz] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;

            if (nx >= 0 && ny >= 0 && nz >= 0 && nx < size && ny < size && nz < size) {
              const neighborKey = `${nx}-${ny}-${nz}`;
              // Only create joint once per pair to avoid redundant joints
              if (currentKey < neighborKey) {
                // Create a ref object for neighbor particle
                const neighborParticleRef = {
                  get current() { return particleMap.current.get(neighborKey); }
                };

                // Set anchor vectors directly
                anchorAVector.set((dx * spacing) / 2, (dy * spacing) / 2, (dz * spacing) / 2);
                anchorBVector.set((-dx * spacing) / 2, (-dy * spacing) / 2, (-dz * spacing) / 2);

                components.push(
                  <JointComponent
                    key={`j-${currentKey}-${neighborKey}`}
                    bodyA={currentParticleRef}
                    bodyB={neighborParticleRef}
                    anchorA={anchorAVector.clone()} // Clone to ensure each JointComponent gets its own instance
                    anchorB={anchorBVector.clone()} // Clone to ensure each JointComponent gets its own instance
                    restLength={restLength}
                    stiffness={stiffness}
                    damping={damping}
                  />
                );
              }
            }
          }
        }
      }
    }
    return components;
  }, [size, spacing, directions, stiffness, damping]); // Only re-run if these props change

  // Generate rigid body particles
  const particles = useMemo(() => {
    const out = [];

    // Pre-calculate half-size and initial position offsets outside the loop
    const halfSizeX = (size / 2) * spacing;
    const halfSizeY = (size / 2) * spacing;
    const halfSizeZ = (size / 2) * spacing;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const key = `${x}-${y}-${z}`;
          const position = [
            initialPosition.x + (x * spacing) - halfSizeX,
            initialPosition.y + (y * spacing) - halfSizeY,
            initialPosition.z + (z * spacing) - halfSizeZ,
          ];

          out.push(
            <RigidBody
              key={key}
              ref={useCallback((rb) => { // Use useCallback for the ref callback
                if (rb) {
                  particleMap.current.set(key, rb);
                } else {
                  particleMap.current.delete(key);
                }
              }, [key])} // Dependency: key
              type="dynamic"
              enabled={isReady}
              colliders="ball"
              position={position}
              mass={PARTICLE_MASS}
              linearDamping={LINEAR_DAMPING}
              angularDamping={ANGULAR_DAMPING}
              restitution={RESTITUTION}
              friction={FRICTION}
            >
              <mesh castShadow receiveShadow>
                <sphereGeometry args={[radius]} />
                <meshStandardMaterial
                  color={color}
                  transparent={true}
                  opacity={0} // Change this value (0.0 - 1.0)
                />
              </mesh>
            </RigidBody>
          );
        }
      }
    }
    return out;
  }, [size, spacing, radius, initialPosition, color, isReady]); // isReady is a dependency for `enabled` prop

  return (
    <>
      {particles}
      {isReady && joints}
      {isReady && (
        <JellyCubeSurfaceMesh
          particleMap={particleMap}
          size={size}
          color={color}
        />
      )}
    </>
  );
}