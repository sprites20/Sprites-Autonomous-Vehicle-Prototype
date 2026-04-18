import { RigidBody, useRapier } from "@react-three/rapier";
import { useRef, useEffect } from "react";

export function Rope({ segments = 10, spacing = 0.2, radius = 0.05, start = [0, 2, 0] }) {
  const { world, rapier } = useRapier();
  const bodies = useRef([]);

  // Create joints once bodies are mounted
  useEffect(() => {
    for (let i = 1; i < segments; i++) {
      const a = bodies.current[i - 1];
      const b = bodies.current[i];

      if (a && b && a.raw && b.raw) {
        const jointData = rapier.JointData.spherical(
          { x: 0, y: -spacing / 2, z: 0 },
          { x: 0, y: spacing / 2, z: 0 }
        );
        world.createImpulseJoint(jointData, a.raw(), b.raw(), true);
      }
    }
  }, [world, rapier]);

  return (
    <>
      {Array.from({ length: segments }).map((_, i) => (
        <RigidBody
          key={i}
          ref={(rb) => (bodies.current[i] = rb)} // store RigidBody refs in array
          type={i === 0 ? "fixed" : "dynamic"}
          position={[start[0], start[1] - i * spacing, start[2]]}
          colliders="ball"
        >
          <mesh>
            <sphereGeometry args={[radius]} />
            <meshStandardMaterial color="tomato" />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
