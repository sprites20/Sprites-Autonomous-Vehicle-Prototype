import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export function CubeWithTV({ videoSrc = '/video.mp4', position = [0, 1, 0] }) {
  // Use state to manage the texture, which will trigger a re-render when ready.
  const [videoTexture, setVideoTexture] = useState(null);
  const videoRef = useRef(document.createElement('video'));
  // Use state to manage the volume
  const [volume, setVolume] = useState(0.5);

  useEffect(() => {
    const video = videoRef.current;
    
    // Set video properties and source
    video.src = videoSrc;
    video.crossOrigin = 'anonymous'; // Important for CORS if video is external
    video.loop = true;
    video.muted = false; // Essential for autoplay
    video.volume = volume;
    
    // Play the video. This is an asynchronous operation.
    // The video will likely not play until a user interaction has occurred.
    const playPromise = video.play();

    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error("Video autoplay failed:", error);
        // You might want to handle this error state in your UI
      });
    }

    // Create the texture and set it in state
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;

    setVideoTexture(texture);

    // Clean up the texture and video on unmount
    return () => {
      video.pause();
      video.remove();
      texture.dispose();
    };
  }, [videoSrc]);

  useFrame(() => {
    // This is correct: constantly update the texture to reflect the video's frames.
    if (videoTexture) {
      videoTexture.needsUpdate = true;
    }
  });

  // Use useMemo to create the materials array only when the texture changes
  const materials = useMemo(() => {
    const blankMaterial = new THREE.MeshBasicMaterial({ color: 'gray' });
    const tvScreenMaterial = videoTexture
      ? new THREE.MeshBasicMaterial({ map: videoTexture, toneMapped: false })
      : new THREE.MeshBasicMaterial({ color: 'black' }); // Fallback color

    // The order of materials for a BoxGeometry is right, left, top, bottom, front, back.
    // We want the video on the front face (index 4).
    return [
      blankMaterial, // Right face
      blankMaterial, // Left face
      blankMaterial, // Top face
      blankMaterial, // Bottom face
      tvScreenMaterial, // Front face (where the video will be)
      blankMaterial, // Back face
    ];
  }, [videoTexture]);

  return (
    <RigidBody colliders="cuboid" type="fixed">
      <mesh position={position}>
        <boxGeometry args={[4, 2, 0.1]} />
        <primitive object={materials} attach="material" />
      </mesh>
    </RigidBody>
  );
}