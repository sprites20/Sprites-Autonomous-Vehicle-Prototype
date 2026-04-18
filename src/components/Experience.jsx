import { CameraControls, Sky, Stars, ContactShadows, OrbitControls, Environment, Gltf } from "@react-three/drei";
import { useControls } from "leva";
import React, { useRef, useState, useMemo, useCallback, useLayoutEffect, useEffect } from "react"; // Import React, useMemo, useCallback, useLayoutEffect
import { VRMAvatar } from "./VRMAvatar";
import { useRapier, Physics, RigidBody } from "@react-three/rapier";
import { Map } from "./Map";
import { CharacterController } from "./CharacterController";
import { AIController } from "./AIController";
import { GrassComponent } from "./GrassComponent";
import { CubeTextureLoader, Color, Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import {Joystick} from "./Joystick"
import { World } from "./ProceduralMap";
import {Cloth} from "./Cloth";
import {Rope} from "./Rope";
import JellyCube from './JellyCube';
import {RaycastOnMouseHover} from "./RaycasterMouse";
import {CubeWithTV} from "./CubeWithTV";
import {Pathfinder} from "./PathFinder";
import * as THREE from "three";
import {Intersection} from "./Intersection";
import {City} from "./City";
import { SceneContent } from "./SilvermoonHall";

// Define your desired ocean level
const OCEAN_LEVEL = -4; // This should align with your terrain's height calculation
/*
// SkyBox component memoized
const SkyBox = React.memo(() => {
  const { scene } = useThree();
  
  // Memoize loader to avoid re-creation
  const loader = useMemo(() => new CubeTextureLoader(), []); 
  
  // Memoize texture loading
  const texture = useMemo(() => loader.load([
    "/sky/sky_05_2k/px.png", // Positive X (right)
    "/sky/sky_05_2k/nx.png", // Negative X (left)
    "/sky/sky_05_2k/py.png", // Positive Y (up)
    "/sky/sky_05_2k/ny.png", // Negative Y (down)
    "/sky/sky_05_2k/pz.png", // Positive Z (front)
    "/sky/sky_05_2k/nz.png", // Negative Z (back)
  ]), [loader]); // Depend on memoized loader

  // Use useLayoutEffect to set background, runs synchronously after DOM mutations
  useLayoutEffect(() => {
    scene.background = texture;
  }, [scene, texture]); // Only re-run if scene or texture objects change

  return null;
});
*/
export const Experience = ({ joystickRef, joystickOn }) => { // <--- Accepted as a prop!
  // Remove duplicate controls declaration since it's already declared below
  const characterControllerRef = useRef(); // Ref for CharacterController

  // useRef for the actual player position for imperative updates (e.g., within useFrame or physics)
  const playerPositionRef = useRef(new Vector3(0, 0, 0));
  
  // useState for the World component, which needs to react to player position changes
  // for chunk management. This will trigger a re-render of Experience and World.
  // We will strategically update this state less frequently.
  const [worldPlayerPosition, setWorldPlayerPosition] = useState(new Vector3(0, 0, 0));
  
  const enableAvatarControls = false; // 👈 set this to false to hide it
const avatar = "White.vrm";
const { av1 } = useControls(
  "VRM",
  () =>
    enableAvatarControls
      ? {
          avatar: {
            value: "7667029464206216702.vrm",
            options: [
              "7667029464206216702.vrm",
              "262410318834873893.vrm",
              "3682610047957415694.vrm",
              "3636451243928341470.vrm",
              "8087383217573817818.vrm",
              "Escoffier.vrm",
              "Skirk.vrm",
            ],
          },
        }
      : {}, // 👈 empty object = no controls shown
  [enableAvatarControls] // 👈 dependency array so it re-evaluates
);
  const { world } = useRapier();

  // Determine the extent of your generated world to size the ocean
  const chunkRange = 40; // From your <World chunkRange={4} />
  const chunkSize = 16; // Assuming default chunkSize from ProceduralChunk
  const worldDiameter = (2 * chunkRange + 1) * chunkSize;
  const oceanPlaneSize = worldDiameter * 2; // Double the size for extra margin

const oceanMaterial = useMemo(() => {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#87CEEB").convertSRGBToLinear(),
    transparent: false,
    opacity: 0.5,
    roughness: 0.05,
    metalness: 0.7,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transmission: 0.8,
    reflectivity: 0.95,
    ior: 1.33,
  });

  // Fix Z-fighting
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 3; // negative moves it slightly forward in depth
  mat.polygonOffsetUnits = 1;

  return mat;
}, []);
  const controls = useRef(null);

  useEffect(() => {
    if (controls.current) {
      console.log("CameraControls instance ready:", controls.current);
      // now you can access .camera, .dampingFactor, etc.
    }
  }, []);
  
  
  return (
    <>
      <CameraControls
        ref={controls}
        maxPolarAngle={Math.PI}
        minDistance={1}
        maxDistance={100}
        mouseButtons={{
          left: 2,    // left click disables interaction
          right: 1, // right click rotates camera
          middle: 16, // middle click zooms
          wheel: 16,  // scroll wheel zooms
        }}
      />
      {/*<SkyBox />*/}
      {/* Render the memoized SkyBox */}
      {/*<Sky 
  // Move the sun further down (-100 instead of -10)
  sunPosition={[0, -100, 0]} 
  // 0 rayleigh removes the blue atmosphere scattering entirely
  rayleigh={0} 
  turbidity={0}
  mieCoefficient={0}
  mieDirectionalG={0}
  distance={450000}
/>
<Stars 
  radius={150000} // Push them out further
  depth={100}      // Lower depth makes them look like a flat map on the sky
  count={7000}     // More stars since they are spread over a larger area
  factor={7}       // Increase size because they are farther away
  saturation={0} 
  fade={true}      
  speed={0.2}      // Slow rotation looks more "astronomical"
/> */}
  
<Sky
  sunPosition={[100, 100, 100]} // ABOVE horizon
  rayleigh={1}                 // blue sky
  turbidity={8}                // haze
  mieCoefficient={0.005}       // sun glow
  mieDirectionalG={0.8}
  distance={450000}
/>

      <ambientLight intensity={0.4} />
        <directionalLight 
          position={[400, 600, 200]} 
          intensity={2} 
          castShadow 
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-1500}
          shadow-camera-right={1500}
          shadow-camera-top={1500}
          shadow-camera-bottom={-1500}
          shadow-camera-far={3000}
          shadow-bias={-0.0001}
        />
      <ContactShadows 
          opacity={0.5} 
          scale={5000} 
          blur={1.5} 
          far={40} 
          resolution={1024} 
          color="#000000" 
        />

            <directionalLight
          position={[1000, 150, 1000]}
          intensity={1.5}
          distance={10000}
          castShadow
        />

            
      <group position-y={0}>
        {/*<Intersection /> */}

        {/*<World chunkRange={chunkRange} playerPosition={worldPlayerPosition} />*/}
        {/*<City seed={0} />*/}
        <City seed={0} />
        {/* <SceneContent></SceneContent>*/}
        <Map cameraControls={controls} playerPosition={worldPlayerPosition} joystickRef={joystickRef} joystickOn={joystickOn} />
        {/* Pass the reactive state to World, which will update only when player enters new chunk */}
        {/*<GrassComponent size={5} count={1000} position={[0, -11, 0]} />*/}
      </group>
      
      {/* The Ocean Plane - uses memoized material */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, OCEAN_LEVEL - 9, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={oceanMaterial} depthWrite={false}>
          <planeGeometry args={[oceanPlaneSize, oceanPlaneSize, 1, 1]} />
        </mesh>
      </RigidBody>
      {/* 
      <JellyCube
            size={6}
            spacing={0.1}
            radius={0.04}
            stiffness={1000}
            damping={20}
            color="salmon"
            initialPosition={new Vector3(1, 2, 0)}
        />
      */}
      {/* <Cloth
            width={20}
            height={20}
            spacing={0.2}
            position={[0, 0, 0]}
      />*/}
      
      

      {/* Characters */}
      <group position-y={50}>
        <ambientLight intensity={0.5} />
        
        {/* <Pathfinder playerPosition={worldPlayerPosition} targetPosition={new Vector3(50, 0, 10)} />*/}
        {/* */}
        {/* AI Controller 1 in its own group */}
        

      </group>
      {/*<CubeWithTV videoSrc="videos/bad_apple1.mp4" position={[12, -6, 0]} />*/}
      <RaycastOnMouseHover />
    </>
  );
};