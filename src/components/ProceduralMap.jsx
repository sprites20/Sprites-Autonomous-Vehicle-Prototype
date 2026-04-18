import { useEffect, useRef, useState, useCallback } from "react";
import { ProceduralChunk } from './ProceduralChunk';
import { GrassComponent } from './GrassComponent';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import {globalPlayerPosition} from './GlobalPositionStore';

export const World = ({
  renderDistance = 100,
  physicsActiveDistance = 100,
  chunkSize = 16,
  chunkResolution = 4,
  playerPosition = new Vector3(0, 0, 0),
}) => {
  const { camera } = useThree();
  const [renderedChunks, setRenderedChunks] = useState({});
  const lastPlayerChunkX = useRef(null);
  const lastPlayerChunkZ = useRef(null);
  const frameCount = useRef(0);
  const updateInterval = 5;
  const movementThreshold = 70;
  const lastUpdatePositionRef = useRef(new Vector3(0, 0, 0));
// Define this constant outside of the component/hook to prevent re-creation
const MOVE_THRESHOLD = 20.0; // Update chunks only after 1 unit of movement

const updateChunks = useCallback(() => {
    // Read global position directly
    const playerPos = globalPlayerPosition;
    
    // 🔑 OPTIMIZATION: Check if the player has moved enough to justify a re-calculation
    const lastPos = lastUpdatePositionRef.current;


    if (playerPos.distanceTo(lastPos) < MOVE_THRESHOLD) {
        // Also check if the player has crossed a chunk boundary for immediate update
        const currentChunkGridX = Math.floor(playerPos.x / chunkSize);
        const currentChunkGridZ = Math.floor(playerPos.z / chunkSize);
        
        // If movement is minimal AND the player hasn't crossed a boundary, exit early.
        if (currentChunkGridX === lastPlayerChunkX.current && 
            currentChunkGridZ === lastPlayerChunkZ.current) {
            return;
        }
        console.log(playerPos);
        console.log("Boundary crossed");

        // If boundary is crossed, proceed with the update below.
    }
    
    // --- Continue with the expensive calculation only if movement or boundary crossed ---
    
    const playerX = playerPos.x;
    const playerZ = playerPos.z;
    const newRenderedChunks = {};
    const halfRenderChunks = Math.ceil(renderDistance / chunkSize);
    // Recalculate these if the threshold check was bypassed due to boundary crossing
    const currentChunkGridX = Math.floor(playerX / chunkSize); 
    const currentChunkGridZ = Math.floor(playerZ / chunkSize);

    // 1. CHUNK CALCULATION LOOP (Expensive part)
    for (let i = -halfRenderChunks; i <= halfRenderChunks; i++) {
        for (let j = -halfRenderChunks; j <= halfRenderChunks; j++) {
            const chunkGridX = currentChunkGridX + i;
            const chunkGridZ = currentChunkGridZ + j;
            const chunkCenter = new Vector3(
                chunkGridX * chunkSize + chunkSize / 2,
                0,
                chunkGridZ * chunkSize + chunkSize / 2
            );
            const distance = playerPos.distanceTo(chunkCenter);

            if (distance <= renderDistance) {
                const chunkKey = `${chunkGridX},${chunkGridZ}`;
                newRenderedChunks[chunkKey] = {
                    chunkX: chunkGridX,
                    chunkY: chunkGridZ,
                    enablePhysics: distance <= physicsActiveDistance,
                };
            }
        }
    }

    // 2. DIFFERENCE CHECK (Optimized, but still necessary)
    const oldKeys = Object.keys(renderedChunks);
    const newKeys = Object.keys(newRenderedChunks);
    let chunksChanged = false;
    
    // Check 1: Length difference is the fastest check
    if (oldKeys.length !== newKeys.length) {
        chunksChanged = true;
    } else {
        // Check 2: Key/Value difference
        for (const key of newKeys) {
            // Check if key is new OR if any crucial property has changed (X, Y, Physics state)
            const oldChunk = renderedChunks[key];
            const newChunk = newRenderedChunks[key];
            if (!oldChunk ||
                oldChunk.chunkX !== newChunk.chunkX ||
                oldChunk.chunkY !== newChunk.chunkY ||
                oldChunk.enablePhysics !== newChunk.enablePhysics) {
                chunksChanged = true;
                break;
            }
        }
    }
    
    // 3. STATE UPDATE & REF MANAGEMENT
    if (chunksChanged) {
        setRenderedChunks(newRenderedChunks);
    }
    
    // Always update the refs to reflect the position at the time of the calculation
    lastUpdatePositionRef.current.copy(playerPos);
    lastPlayerChunkX.current = currentChunkGridX;
    lastPlayerChunkZ.current = currentChunkGridZ;
    
// 🔑 CORRECTED DEPENDENCIES: Removed 'playerPosition' as it's read globally.
// Added 'setRenderedChunks', which is likely missing but necessary if you want the 
// useCallback to re-create only when setRenderedChunks changes (it usually doesn't change).
}, [renderDistance, physicsActiveDistance, chunkSize, renderedChunks, setRenderedChunks]); 

  useEffect(() => {
    updateChunks();
  }, []);

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % updateInterval === 0) {
      const currentPlayerPos = globalPlayerPosition;
      //console.log(currentPlayerPos);

      const distanceMoved = lastUpdatePositionRef.current.distanceTo(currentPlayerPos);
      //console.log(distanceMoved, movementThreshold);
      if (distanceMoved >= movementThreshold) {
        updateChunks();
      }
    }
  });

  return (
    <>
      {Object.values(renderedChunks).map((chunk) => (
        <ProceduralChunk
          key={`${chunk.chunkX}-${chunk.chunkY}`}
          chunkX={chunk.chunkX}
          chunkY={chunk.chunkY}
          chunkSize={chunkSize}
          resolution={chunkResolution}
          forceEnablePhysics={chunk.enablePhysics}
        />
      ))}
    </>
  );
};