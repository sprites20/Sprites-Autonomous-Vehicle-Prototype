import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

// Import individual components from Grass.js, including the new constant and mutable cloudTexture
import {
    Grass,
    generateGrassGroundTexture,
    cloudTexture as exportedCloudTexture, // Renamed to avoid direct conflict
    TEXTURE_RESOLUTION,
    INITIAL_GROUND_TEXTURE_REPEAT,
} from './Grass';

// Re-assign the imported cloudTexture variable to a local, mutable variable
// This is done once at the module level. The texture loader below will update it.
let cloudTexture = exportedCloudTexture;

export const GrassComponent = ({ size = 5, count = 50000, position = [0, -9, 0] }) => {
    const { scene, camera, gl } = useThree();
    const [grassTiles, setGrassTiles] = useState([]); // State to hold current grass tiles for useFrame

    // Memoize the global ground texture pattern as it doesn't change based on component props
    const globalGroundTexturePattern = useMemo(() => {
        const texture = generateGrassGroundTexture(TEXTURE_RESOLUTION, TEXTURE_RESOLUTION);
        return texture;
    }, []); // Empty dependency array means it's created once

    // Effect for initial scene setup (lights, camera, global cloud texture loading)
    useEffect(() => {
        console.log("GrassComponent: Setting up initial scene (lights, camera, cloud texture).");

        // Set up lighting (only once for the entire scene, not per GrassComponent instance)
        const ambientLight = new THREE.AmbientLight(0x404040, 2.5);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3.5);
        directionalLight.position.set(25, 30, 25);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        const shadowCameraSize = 150;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 100;
        directionalLight.shadow.camera.left = -shadowCameraSize;
        directionalLight.shadow.camera.right = shadowCameraSize;
        directionalLight.shadow.camera.top = shadowCameraSize;
        directionalLight.shadow.camera.bottom = -shadowCameraSize;

        // Set camera initial position (consider if this should be managed by the Map component or App)
        camera.position.set(-20, 15, 20);
        camera.lookAt(0, 0, 0);

        // Load cloud texture and update the shared `cloudTexture` variable
        const cloudTextureLoader = new THREE.TextureLoader();
        cloudTextureLoader.load(
            "/cloud.jpg",
            (texture) => {
                cloudTexture = texture; // Update the shared `cloudTexture` variable
                cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;
                console.log("Cloud texture loaded and applied.");
            },
            undefined,
            (err) => {
                console.error("An error occurred loading the cloud texture:", err);
                cloudTexture = new THREE.Texture(); // Fallback to an empty texture
            }
        );

        // Clean up lights on component unmount
        return () => {
            console.log("GrassComponent: Cleaning up initial scene setup (lights).");
            scene.remove(ambientLight);
            scene.remove(directionalLight);
            // globalGroundTexturePattern.dispose(); // Only dispose if this component is the sole user of it
        };
    }, []); // Dependencies for initial setup (lights, camera, texture loading)

    // Effect for creating and disposing of the grass tiles themselves
    useEffect(() => {
        console.log("GrassComponent: Creating new grass tiles based on props.");

        const tileCount = 5; // Fixed number of tiles for now, could be prop
        const tilePlaneSize = size; // Use prop for tile size
        const grassBladeAreaSize = tilePlaneSize;
        const grassBladeDensityPerTile = count; // Use prop for grass count

        const currentGrassTiles = []; // Local array to hold tiles created in this specific effect run
        for (let i = 0; i < tileCount; i++) {
            for (let j = 0; j < tileCount; j++) {
                const tileOffsetUV = new THREE.Vector2(i / tileCount, j / tileCount);
                const tileUVScale = 1 / tileCount;

                const grass = new Grass(
                    tilePlaneSize,
                    grassBladeAreaSize,
                    grassBladeDensityPerTile,
                    globalGroundTexturePattern,
                    tileOffsetUV,
                    tileUVScale,
                    INITIAL_GROUND_TEXTURE_REPEAT
                );

                const offsetX = (i - (tileCount - 1) / 2) * tilePlaneSize;
                const offsetZ = (j - (tileCount - 1) / 2) * tilePlaneSize;
                // Apply the component's position prop to the tile group
                grass.position.set(offsetX + position[0], position[1], offsetZ + position[2]);
                scene.add(grass);
                currentGrassTiles.push(grass);
            }
        }
        setGrassTiles(currentGrassTiles); // Update state for useFrame to access

        console.log(`GrassComponent: Created ${currentGrassTiles.length} grass tiles.`);

        // Cleanup function for this specific effect run
        return () => {
            console.log("GrassComponent: Cleaning up old grass tiles from previous render.");
            // Dispose of the tiles that were created in *this* specific effect execution
            currentGrassTiles.forEach(tile => {
                scene.remove(tile);
                if (tile.geometry) tile.geometry.dispose();
                if (tile.material) tile.material.dispose();
                tile.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            });
            // globalGroundTexturePattern.dispose(); // Do not dispose here if it's used by other components/tiles
        };
    }, []); // Dependencies: re-runs if these change

    const frameCountRef = useRef(0);

    useFrame(({ clock }) => {
        const time = clock.getElapsedTime();
        const cameraPosition = camera.position;
    
        grassTiles.forEach((grass) => {
            // Calculate distance from camera to the center of the grass tile
            const tileCenter = new THREE.Vector3();
            grass.getWorldPosition(tileCenter); // Get world position of the tile's origin
    
            const distance = cameraPosition.distanceTo(tileCenter);
            const visibilityThreshold = 80; // Adjust this value based on your scene scale
    
            if (distance > visibilityThreshold) {
                grass.visible = false;
            } else {
                grass.visible = true;
                grass.update(time * 500); // Only update if visible
            }
        });
    });

    return null; // The GrassComponent doesn't render any visible elements itself
};