import { useEffect, useState, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { Sphere } from "@react-three/drei";

// A* Node class: Represents a single point in the pathfinding grid.
// Stores its world coordinates (x, y, z), whether it's walkable,
// and A* specific costs (g, h, f) and its parent node for path reconstruction.
class Node {
  constructor(x, y, z, walkable) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.walkable = walkable;
    this.g = 0; // Cost from start node to this node
    this.h = 0; // Heuristic cost from this node to the end node
    this.f = 0; // Total cost (g + h)
    this.parent = null; // The previous node in the optimal path from the start
  }
}

// === Pathfinder Component ===
// This component calculates and visualizes a path between a player and a target position
// using the A* algorithm. Collider checks are commented out for testing path generation only.
export const Pathfinder = ({ playerPosition, targetPosition, gridSize = 100, resolution = 0.5 }) => {
  // useRapier hook provides access to the Rapier physics world.
  // Although collider checks are commented out, we keep useRapier for context
  // with the original code and potential future re-integration.
  const { world } = useRapier();
  
  // State to store the calculated path (array of THREE.Vector3 positions)
  const [path, setPath] = useState([]);
  
  // Ref to hold references to the visualization spheres (optional, for direct manipulation)
  const pathSpheres = useRef([]);
  
  // useThree hook provides access to the Three.js scene (optional, for direct scene manipulation)
  const { scene } = useThree(); 

  // findPath function: Implements the A* pathfinding algorithm.
  // It takes start and end positions (THREE.Vector3) and computes a path.
  const findPath = (start, end) => {
    // Note: The original Rapier world check is commented out as requested.
    // if (!world.rapier) {
    //   console.warn("Rapier world not initialized yet. Cannot find path.");
    //   return;
    // }

    // 1. Grid Generation
    // Create a 2D grid of Nodes covering the area between start and end positions,
    // extended by gridSize/2 in each direction.
    const grid = [];
    
    // Determine the minimum X and Z coordinates for the grid's origin.
    const minX = Math.floor(Math.min(start.x, end.x) - gridSize / 2);
    const minZ = Math.floor(Math.min(start.z, end.z) - gridSize / 2);

    // Calculate the number of cells along X and Z axes based on gridSize and resolution.
    const numCellsX = Math.ceil(gridSize / resolution);
    const numCellsZ = Math.ceil(gridSize / resolution);

    // Populate the grid with Node objects.
    for (let i = 0; i < numCellsX; i++) {
      grid[i] = []; // Initialize a new row for the grid
      const currentWorldX = minX + i * resolution; // Calculate the world X coordinate for this grid column
      for (let j = 0; j < numCellsZ; j++) {
        const currentWorldZ = minZ + j * resolution; // Calculate the world Z coordinate for this grid row

        // Original raycasting logic to determine walkability and ground height is commented out.
        // This was used to check for colliders in the Rapier physics world.
        // const raycastOrigin = new THREE.Vector3(currentWorldX, start.y + 5, currentWorldZ);
        // const raycastDirection = new THREE.Vector3(0, -1, 0);
        // const hit = world.rapier.castRay(raycastOrigin, raycastDirection, 10, true);

        // For this demonstration, all grid nodes are considered walkable.
        // The Y-coordinate is simplified to the start (player) Y position,
        // assuming a flat ground for path generation without physics interaction.
        let walkable = true;
        let yCoord = start.y;

        // Original logic to set yCoord and walkable based on Rapier hit:
        // if (hit && hit.collider.parent() && hit.collider.parent().handle !== 0) {
        //   yCoord = hit.point.y;
        //   walkable = true;
        // }

        // Create a new Node for the current grid cell and add it to the grid.
        grid[i][j] = new Node(currentWorldX, yCoord, currentWorldZ, walkable);
      }
    }

    // Helper function to retrieve a Node from the grid using world coordinates.
    // It converts world coordinates to grid indices and clamps them to ensure
    // a valid grid node is always returned, even if the world coordinate is slightly off.
    const getNodeFromWorldCoords = (worldX, worldZ) => {
      let gridIdxX = Math.floor((worldX - minX) / resolution);
      let gridIdxZ = Math.floor((worldZ - minZ) / resolution);

      // Clamp indices to ensure they are within the valid grid boundaries.
      gridIdxX = Math.max(0, Math.min(gridIdxX, numCellsX - 1));
      gridIdxZ = Math.max(0, Math.min(gridIdxZ, numCellsZ - 1));
      
      return grid[gridIdxX][gridIdxZ];
    };

    // 2. A* Algorithm Core Logic
    // Sets of nodes to be evaluated (openSet) and already evaluated (closedSet).
    const openSet = [];
    const closedSet = [];

    // Get the start and end nodes from the generated grid using their world positions.
    // These will now always resolve to a valid grid node due to clamping.
    const startNode = getNodeFromWorldCoords(start.x, start.z);
    const endNode = getNodeFromWorldCoords(end.x, end.z);

    // Since we're assuming everything is walkable and getNodeFromWorldCoords
    // now clamps to valid grid indices, we can remove the console.warn.
    // The nodes are guaranteed to exist and be walkable.
    // if (!startNode || !endNode || !startNode.walkable || !endNode.walkable) {
    //   console.warn("Start or end point is not on the grid or not walkable. Cannot find path.");
    //   setPath([]); // Clear any existing path
    //   return;
    // }

    // Add the start node to the open set to begin the search.
    openSet.push(startNode);

    // Main A* loop: continues as long as there are nodes to evaluate.
    while (openSet.length > 0) {
      // Find the node in the open set with the lowest 'f' cost (g + h).
      let lowestFIndex = 0;
      for (let i = 0; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestFIndex].f) {
          lowestFIndex = i;
        }
      }
      const currentNode = openSet.splice(lowestFIndex, 1)[0]; // Remove and get the node with lowest f cost
      closedSet.push(currentNode); // Add it to the closed set (evaluated nodes)

      // If the current node is the end node, we have found the path.
      if (currentNode === endNode) {
        // Reconstruct the path by backtracking from the end node to the start node
        // using the 'parent' pointers.
        const path = [];
        let temp = currentNode;
        while (temp) {
          path.push(new THREE.Vector3(temp.x, temp.y, temp.z));
          temp = temp.parent;
        }
        setPath(path.reverse()); // Reverse the path to go from start to end
        return;
      }

      // Get neighbors of the current node (8 directions).
      const neighbors = [];
      for (let dx = -resolution; dx <= resolution; dx += resolution) {
        for (let dz = -resolution; dz <= resolution; dz += resolution) {
          if (dx === 0 && dz === 0) continue; // Skip the current node itself

          // Calculate the world coordinates of the potential neighbor.
          const neighborWorldX = currentNode.x + dx;
          const neighborWorldZ = currentNode.z + dz;

          // Retrieve the neighbor node from the grid.
          // We use getNodeFromWorldCoords, which now clamps the indices.
          const neighbor = getNodeFromWorldCoords(neighborWorldX, neighborWorldZ);

          // If the neighbor exists, is walkable (always true now), and has not been evaluated yet, add it to neighbors.
          if (neighbor && neighbor.walkable && !closedSet.includes(neighbor)) {
            neighbors.push(neighbor);
          }
        }
      }

      // Evaluate each neighbor.
      for (const neighbor of neighbors) {
        // Create THREE.Vector3 instances for distance calculations.
        const currentPos = new THREE.Vector3(currentNode.x, currentNode.y, currentNode.z);
        const neighborPos = new THREE.Vector3(neighbor.x, neighbor.y, neighbor.z);
        const endPos = new THREE.Vector3(endNode.x, endNode.y, endNode.z);

        // Calculate the tentative 'g' cost: cost from start to neighbor through current node.
        const tentativeG = currentNode.g + currentPos.distanceTo(neighborPos);

        // If this new path to the neighbor is better (lower G cost) or the neighbor
        // is not yet in the open set, update its costs and parent.
        if (tentativeG < neighbor.g || !openSet.includes(neighbor)) {
          neighbor.g = tentativeG;
          // Calculate 'h' cost (heuristic): Euclidean distance from neighbor to end node.
          neighbor.h = neighborPos.distanceTo(endPos);
          neighbor.f = neighbor.g + neighbor.h; // Update total cost
          neighbor.parent = currentNode; // Set current node as its parent

          // If the neighbor is not already in the open set, add it.
          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    // If the loop finishes and the end node was not reached, no path was found.
    setPath([]); // Clear path
    console.warn("No path found to the target.");
  };

  // useEffect hook: Triggers pathfinding whenever playerPosition or targetPosition changes.
  // Also re-runs if gridSize or resolution changes.
  const playerPosRef = useRef(playerPosition);
  const targetPosRef = useRef(targetPosition);

  // Keep refs updated with latest positions
  playerPosRef.current = playerPosition;
  targetPosRef.current = targetPosition;

  useEffect(() => {
    const interval = setInterval(() => {
      if (playerPosRef.current && targetPosRef.current) {
        console.log("Finding path");
        findPath(playerPosRef.current, targetPosRef.current);
        console.log("Path found");

      }
    }, 1000); // run every 2 seconds

    return () => clearInterval(interval); // cleanup on unmount
  }, []); // empty dependency: runs once on mount, interval keeps going
  // useFrame hook: Runs on every frame.
  // This is optional for visualizing static spheres, but included as per original code.
  // It could be used for animating the spheres along the path if desired.
  useFrame(() => {
    if (path.length > 0 && pathSpheres.current.length > 0) {
      // Example of how you might update positions if using refs for animation,
      // but for simple rendering, React's state update is sufficient.
      // pathSpheres.current.forEach((sphere, index) => {
      //   if (path[index]) {
      //     sphere.position.copy(path[index]);
      //   }
      // });
    }
  });

  // Render the path as a series of green Sphere components.
  return (
    <group>
      {path.map((pos, index) => (
        <Sphere
          key={index} // Unique key for each sphere for React rendering efficiency
          position={pos} // Set the position of the sphere
          args={[0.1]} // Define the radius of the sphere (0.1 units)
          // Ref is commented out as direct rendering from state is usually preferred for static visuals.
          // ref={el => pathSpheres.current[index] = el}
          material={new THREE.MeshBasicMaterial({ color: 'red' })} // Green material for visibility
        />
      ))}
    </group>
  );
};
