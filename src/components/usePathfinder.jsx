import { useState, useEffect, useRef } from "react";
import { useRapier, RigidBody } from "@react-three/rapier";

const CAPSULE_HALF_HEIGHT = 1.75;
const CAPSULE_RADIUS = 0.3;

export function usePathfinder(startPos, goalPos) {
  const { world } = useRapier();

  // State for path
  const [path, setPath] = useState(null);

  // Refs for pathfinding internal data
  const openSet = useRef([]);
  const closedSet = useRef(new Set());
  const cameFrom = useRef({});
  const gScore = useRef({});

  // Temporary collider rigid body ref for collision testing
  const testColliderRef = useRef();

  // Setup initial pathfinding
  useEffect(() => {
    if (!world) return;

    const startNode = {
      id: `${startPos.x.toFixed(2)},${startPos.y.toFixed(2)},${startPos.z.toFixed(2)}`,
      position: startPos,
    };

    openSet.current = [startNode];
    closedSet.current = new Set();
    cameFrom.current = {};
    gScore.current = { [startNode.id]: 0 };
    setPath(null);
  }, [world, startPos, goalPos]);
  // This is a conceptual implementation. You would need to refine it.
    function getNeighbors(current) {
        const neighbors = [];
        const stepSize = 1; // You can adjust this value
        const currentPos = current.position;

        // Check neighbors in all 8 horizontal directions
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;

                const newX = currentPos.x + dx * stepSize;
                const newZ = currentPos.z + dz * stepSize;
                
                // Perform a raycast or shapecast down to find the ground
                const groundY = findGroundY(newX, newZ); 

                if (groundY !== null) {
                    const newNeighbor = {
                        id: `${newX.toFixed(2)},${groundY.toFixed(2)},${newZ.toFixed(2)}`,
                        position: { x: newX, y: groundY, z: newZ }
                    };
                    neighbors.push(newNeighbor);
                }
            }
        }
        return neighbors;
    }
  function isCapsuleCollisionFree(pos) {
    if (!world) return false;

    // Create a temporary capsule shape at the test position
    const shape = new rapier.Capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS);
    const posVector = new rapier.Vector3(pos.x, pos.y, pos.z);
    
    // Check for intersections
    const colliding = world.intersectionsWithShape(posVector, new rapier.Quaternion(), shape, (collider) => {
        // Exclude the player's own collider from the check
        return collider !== rigidbody.current.raw(); // Assuming you pass the player's rigidbody ref
    });
    
    // If no intersections, the space is free
    return colliding.length === 0;
}

  // A* pathfinding loop
  useEffect(() => {
    if (!world || !testColliderRef.current) return;
    if (path) return;

    function step() {
      if (openSet.current.length === 0) {
        setPath(null);
        return;
      }

      // Sort openSet by f = g + h
      openSet.current.sort(
        (a, b) =>
          (gScore.current[a.id] + heuristic(a.position, goalPos)) -
          (gScore.current[b.id] + heuristic(b.position, goalPos))
      );
      const current = openSet.current.shift();

      if (current.id === `${goalPos.x.toFixed(2)},${goalPos.y.toFixed(2)},${goalPos.z.toFixed(2)}`) {
        const foundPath = reconstructPath(cameFrom.current, current.id).map(id => {
          const [x, y, z] = id.split(",").map(Number);
          return { x, y, z };
        });
        setPath(foundPath);
        return;
      }

      closedSet.current.add(current.id);

      for (const neighbor of getNeighbors(current)) {
        if (closedSet.current.has(neighbor.id)) continue;
        if (!isCapsuleCollisionFree(neighbor.position)) continue;

        const tentativeG = (gScore.current[current.id] ?? Infinity) + heuristic(current.position, neighbor.position);
        if (tentativeG < (gScore.current[neighbor.id] ?? Infinity)) {
          cameFrom.current[neighbor.id] = current.id;
          gScore.current[neighbor.id] = tentativeG;

          if (!openSet.current.some(n => n.id === neighbor.id)) {
            openSet.current.push(neighbor);
          }
        }
      }

      requestAnimationFrame(step);
    }

    step();
  }, [world, path, goalPos]);

  return [path, testColliderRef];
}
