import { useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export function SoundEmitter({ url, position = [0, 0, 0] }) {
  const meshRef = useRef();
  const audioRef = useRef();
  const { camera } = useThree();

  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    const sound = new THREE.PositionalAudio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load(url, (buffer) => {
      sound.setBuffer(buffer);
      sound.setRefDistance(5); // audible distance
      sound.setLoop(true);
      sound.setVolume(1);
      sound.play();
    });

    if (meshRef.current) {
      meshRef.current.add(sound);
      audioRef.current = sound;
    }

    return () => {
      sound.stop();
      camera.remove(listener);
    };
  }, [url, camera]);

  return (
    <mesh ref={meshRef} position={position} visible={false}>
      {/* Invisible mesh */}
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}
