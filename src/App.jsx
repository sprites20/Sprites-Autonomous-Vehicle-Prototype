import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { CameraWidget } from "./components/CameraWidget";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";
import { Physics } from "@react-three/rapier";
import * as THREE from "three";
import { Joystick } from "./components/Joystick";
import React, { useRef, useState, useEffect } from "react";
import JellyCube from './components/JellyCube';
import { Vector3 } from 'three';
// Set gravity to a stronger value (e.g., -30 for a more realistic gravity effect)
const gravity = new THREE.Vector3(0, -9.8, 0);


function App() {
  const joystickRef = useRef(); // The joystickRef should live here now
  const joystickOn = useRef();

  const [deviceId, setDeviceId] = useState("");
  // Utility functions for cookies
  function setCookie(name, value, days = 365) {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
    }

  function getCookie(name) {
    return document.cookie
      .split("; ")
      .reduce((r, v) => {
        const parts = v.split("=");
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
      }, "");
  }

  function generateUUID() {
    return crypto.randomUUID(); // use polyfill if needed
  }

  // Set device UUID cookie on first load
  useEffect(() => {
    let uuid = getCookie("device_uuid");
    if (!uuid) {
      uuid = generateUUID();
      setCookie("device_uuid", uuid);
    }
    setDeviceId(uuid);
    console.log("Device UUID:", deviceId);
  }, []);

  useEffect(() => {
    if (deviceId) {
      console.log("Device UUID (from state):", deviceId);
    }
  }, [deviceId]);

  return (
    <>
      <UI deviceId={deviceId}/>
      {/*<CameraWidget />*/}
      {/*<Loader />*/}
      <Joystick ref={joystickRef} joystickOn={joystickOn}/>
      <Canvas 
        onContextMenu={(e) => e.nativeEvent.preventDefault()}
        gl={{ logarithmicDepthBuffer: false, antialias: true, stencil: false, depth: true, alpha: false, powerPreference: "high-performance" }} 
        camera={{ position: [10, 10, 10], near: 0.1, far: 10000 }} // Increased near plane
        shadows
      >
        <color attach="background" args={["#333"]} />
        <fog attach="fog" args={["#333", 1000, 2000]} />
        {/* <Stats /> */}

        <Suspense>
          <Physics gravity={gravity}>
            <Experience joystickRef={joystickRef} joystickOn={joystickOn}/>
          </Physics>
        </Suspense>
      </Canvas>
      
    </>
  );
}

export default App;
