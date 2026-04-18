import { RigidBody } from "@react-three/rapier";
import { useRef } from "react";
import { Vector3 } from "three";
import { useFrame } from "@react-three/fiber"; // Import useFrame for animation

/**
 * Renders a dynamic spherical RigidBody that can interact with other physics objects.
 * This version of the ball will move in a simple oscillating pattern to demonstrate clothiness.
 *
 * @param {number} radius - The radius of the ball.
 * @param {string} color - The color of the ball.
 * @param {Vector3} position - The initial world position of the ball.
 * @param {number} speed - How fast the ball moves.
 * @param {number} range - How far the ball moves from its initial position.
 */
export default function Ball({
  radius = 0.25,
  color = "hotpink",
  position = new Vector3(0, -1.8, 0), // Default position slightly above the floor
  speed = 1, // Speed of oscillation
  range = 2, // Range of oscillation
}) {
  const ballRef = useRef(null);

  // Use useFrame to animate the ball's position over time
  useFrame(({ clock }) => {
    if (ballRef.current) {
      // Calculate a new X position using a sine wave for oscillation
      const newY = position.y + Math.sin(clock.elapsedTime * speed) * range;
      // Set the kinematic position of the ball.
      // kinematicPosition allows us to control the body's position directly
      // while still allowing it to interact with other physics objects.
      ballRef.current.setNextKinematicTranslation({
        x: position.x,
        y: newY, // Keep Y constant
        z: position.z, // Keep Z constant
      });
    }
  });

  return (
    <RigidBody
      ref={ballRef}
      type="kinematicPosition" // Changed type to kinematicPosition for controlled movement
      colliders="ball" // Use a spherical collider
      position={position} // Initial position
      restitution={0.7} // Bounciness
      friction={0.5}    // Surface friction
      linearDamping={0.1}
      angularDamping={0.1}
    >
      <mesh castShadow>
        <sphereGeometry args={[radius]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}
