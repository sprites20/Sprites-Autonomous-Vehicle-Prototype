import { Billboard, CameraControls, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, CapsuleCollider, RigidBody, vec3 } from "@react-three/rapier";
import { useEffect, useRef, useState } from "react";
import { VRMAvatar } from "./VRMAvatar";
import * as THREE from "three";
// In the component where takeFirstPersonScreenshot is defined
import { screenshotEventEmitter } from '../utils/eventEmitter'; // Adjust path as needed

const MOVEMENT_SPEED = 5; // Change this for movement speed
const JUMP_FORCE = 10; // Adjust this for jump height

// Define fixed step snap parameters here for clarity
const SNAP_STEP_DISTANCE = 0.2; // Raycast distance for step detection
const SNAP_STEP_HEIGHT = 0.2; // How high a step the character can take

// === DEBUG SETTINGS ===
const DEBUG_STEP_RAYS = false; // Set to true to visualize step snap rays

export const CharacterController = ({ avatar, cameraControls, world, onPlayerPositionChange, ...props }) => {
  const group = useRef();
  const character = useRef();
  const rigidbody = useRef();
  const keys = useRef({});
  const [isMoving, setIsMoving] = useState(false);
  const [isGrounded, setIsGrounded] = useState(true);
  const firstPersonCamera = useRef(new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000));
  const { gl, scene } = useThree();
  const { isChatting, setIsChatting } = useThree(); // Destructure correctly if useThree provides this
  const { rapier } = useRapier();

  // Optimized: Frame counter for throttling step snap checks
  const stepFrameCounter = useRef(0);
  const STEP_UPDATE_INTERVAL = 5; // Check for step snapping every 5 frames

  // Handle key presses
  useEffect(() => {
    const handleKeyDown = (e) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const takeFirstPersonScreenshot = () => {
    if (!rigidbody.current) return;

    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();
    
    
    // Eye level position
    const baseEye = new THREE.Vector3(position.x, position.y + 1.5, position.z);
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();

    // Move eye slightly forward (e.g., 0.2 units ahead)
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));

    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    // Create a new WebGL render target
    const renderTarget = new THREE.WebGLRenderTarget(800, 600); // Adjust resolution as needed

    // Set up rendering to texture
    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null); // Reset back to screen rendering

    // Read pixels from the render target
    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

    // Create a canvas and draw the pixels to it
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(800, 600);

    // Flip Y and copy pixel data, also increase brightness
    const brightnessFactor = 1.2; // Adjust this value to increase/decrease brightness
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 800; x++) {
        const i = (y * 800 + x) * 4;
        const j = ((599 - y) * 800 + x) * 4;

        // Get original pixel values
        let r = pixels[j];
        let g = pixels[j + 1];
        let b = pixels[j + 2];

        // Increase brightness by scaling the RGB values
        r = Math.min(255, r * brightnessFactor); // Ensure the values don't exceed 255
        g = Math.min(255, g * brightnessFactor);
        b = Math.min(255, b * brightnessFactor);

        // Apply the adjusted brightness to the image data
        imageData.data[i] = r;
        imageData.data[i + 1] = g;
        imageData.data[i + 2] = b;
        imageData.data[i + 3] = pixels[j + 3]; // Alpha remains the same
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Open in new tab
    const dataUrl = canvas.toDataURL("image/png");
    const newTab = window.open();
    newTab.document.write(`
      <html>
        <head>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              overflow: hidden;
              background: black;
            }
            img {
              display: block;
              width: 100vw;
              height: 100vh;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" />
        </body>
      </html>
    `);
    newTab.document.close();
  };


  const takeFirstPersonScreenshotEvent = () => {  
    if (!rigidbody.current) return;

    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();
    
    
    // Eye level position
    const baseEye = new THREE.Vector3(position.x, position.y + 1.5, position.z);
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();

    // Move eye slightly forward (e.g., 0.2 units ahead)
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));

    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    // Create a new WebGL render target
    const renderTarget = new THREE.WebGLRenderTarget(800, 600); // Adjust resolution as needed

    // Set up rendering to texture
    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null); // Reset back to screen rendering

    // Read pixels from the render target
    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

    // Create a canvas and draw the pixels to it
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(800, 600);

    // Flip Y and copy pixel data, also increase brightness
    const brightnessFactor = 1.2; // Adjust this value to increase/decrease brightness
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 800; x++) {
        const i = (y * 800 + x) * 4;
        const j = ((599 - y) * 800 + x) * 4;

        // Get original pixel values
        let r = pixels[j];
        let g = pixels[j + 1];
        let b = pixels[j + 2];

        // Increase brightness by scaling the RGB values
        r = Math.min(255, r * brightnessFactor); // Ensure the values don't exceed 255
        g = Math.min(255, g * brightnessFactor);
        b = Math.min(255, b * brightnessFactor);

        // Apply the adjusted brightness to the image data
        imageData.data[i] = r;
        imageData.data[i + 1] = g;
        imageData.data[i + 2] = b;
        imageData.data[i + 3] = pixels[j + 3]; // Alpha remains the same
      }
    }

    ctx.putImageData(imageData, 0, 0);  

    const dataUrl = canvas.toDataURL("image/png");  
    //console.log("Screenshot taken. Dispatching event...", dataUrl);
    // Dispatch the 'screenshotTaken' event
    screenshotEventEmitter.dispatchEvent(new CustomEvent('screenshotTaken', { detail: { imageData: dataUrl } }));
  };

  // Effect to listen for the screenshot request event
  useEffect(() => {
    const handleRequestScreenshot = () => {
      console.log("Screenshot request received. Taking screenshot...");
      takeFirstPersonScreenshotEvent();
    };

    screenshotEventEmitter.addEventListener('requestScreenshot', handleRequestScreenshot);

    return () => {
      screenshotEventEmitter.removeEventListener('requestScreenshot', handleRequestScreenshot);
    };
  }, [rigidbody, firstPersonCamera, gl, scene]); // Add all necessary dependencies for takeFirstPersonScreenshot


  // Check if the character is grounded
  const checkGrounded = () => {
    const position = rigidbody.current.translation();
    // A simple Y-position check. For more robust grounding, consider a raycast downwards.
    setIsGrounded(position.y <= 500); // Adjust threshold as needed
  };

  // --- Raycast references (minor optimization, avoiding re-creation) ---
  // Initialize with actual Rapier.Vector3 objects
  const forwardRayOrigin = useRef(new rapier.Vector3(0,0,0));
  const forwardRayDir = useRef(new rapier.Vector3(0,0,0));
  const upperRayOrigin = useRef(new rapier.Vector3(0,0,0));
  const downwardRayDir = useRef(new rapier.Vector3(0, -1, 0)); // Fixed downward direction

  // Handle movement, jumping, and rotation each frame
  useFrame(() => {
    if (!cameraControls?.current || !rigidbody.current) return;

    const camera = cameraControls.current.camera;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const speed = MOVEMENT_SPEED;

    const isMoving =
      keys.current["w"] || keys.current["a"] || keys.current["s"] || keys.current["d"];

    // Movement vector accumulator
    const moveVec = new THREE.Vector3();

    if (keys.current["w"]) {
      moveVec.add(direction);
    }

    if (keys.current["s"]) {
      moveVec.sub(direction);
    }

    if (keys.current["a"]) {
      const left = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
      moveVec.add(left);
    }

    if (keys.current["d"]) {
      const right = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
      moveVec.add(right);
    }

    if (isMoving && moveVec.lengthSq() > 0) {
      moveVec.normalize();

      // 🔄 Rotate the character toward movement direction
      const angle = Math.atan2(moveVec.x, moveVec.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
      rigidbody.current.setRotation(q, true);

      // === OPTIMIZED STEP SNAP LOGIC ===
      stepFrameCounter.current++; // Increment counter every frame
      if (stepFrameCounter.current % STEP_UPDATE_INTERVAL === 0) {
        const pos = rigidbody.current.translation();
        const forwardOffset = 0.25; // How far ahead to raycast for steps

        // Update ray origin and direction for the forward ray
        // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
        forwardRayOrigin.current = new rapier.Vector3(
          pos.x + moveVec.x * forwardOffset,
          pos.y + 0.04, // Slightly above ground
          pos.z + moveVec.z * forwardOffset
        );
        // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
        forwardRayDir.current = new rapier.Vector3(moveVec.x, 0, moveVec.z); // Normalized movement direction
        const forwardRay = new rapier.Ray(forwardRayOrigin.current, forwardRayDir.current);

        // Optional: Debug draw forward ray
        if (DEBUG_STEP_RAYS) {
          const start = new THREE.Vector3(forwardRayOrigin.current.x, forwardRayOrigin.current.y, forwardRayOrigin.current.z);
          const end = new THREE.Vector3(
            forwardRayOrigin.current.x + forwardRayDir.current.x * SNAP_STEP_DISTANCE,
            forwardRayOrigin.current.y + forwardRayDir.current.y * SNAP_STEP_DISTANCE,
            forwardRayOrigin.current.z + forwardRayDir.current.z * SNAP_STEP_DISTANCE
          );
          const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
          const material = new THREE.LineBasicMaterial({ color: 0xff00ff });
          const debugLine = new THREE.Line(geometry, material);
          scene.add(debugLine);
          setTimeout(() => scene.remove(debugLine), 100);
        }

        const hit = world.castRay(forwardRay, SNAP_STEP_DISTANCE, true);

        if (hit && hit.timeOfImpact < SNAP_STEP_DISTANCE) {
          const stepPoint = forwardRay.pointAt(hit.timeOfImpact);

          // Update ray origin for the upper ray
          // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
          upperRayOrigin.current = new rapier.Vector3(stepPoint.x, stepPoint.y + SNAP_STEP_HEIGHT, stepPoint.z);
          const upperRay = new rapier.Ray(upperRayOrigin.current, downwardRayDir.current); // Raycast downwards from above step

          // Optional: Debug draw upper ray
          if (DEBUG_STEP_RAYS) {
            const upStart = new THREE.Vector3(upperRayOrigin.current.x, upperRayOrigin.current.y, upperRayOrigin.current.z);
            const upEnd = new THREE.Vector3(
              upperRayOrigin.current.x + downwardRayDir.current.x * SNAP_STEP_HEIGHT,
              upperRayOrigin.current.y + downwardRayDir.current.y * SNAP_STEP_HEIGHT,
              upperRayOrigin.current.z + downwardRayDir.current.z * SNAP_STEP_HEIGHT
            );
            const upGeom = new THREE.BufferGeometry().setFromPoints([upStart, upEnd]);
            const upLine = new THREE.Line(upGeom, new THREE.LineBasicMaterial({ color: 0x00ffff }));
            scene.add(upLine);
            setTimeout(() => scene.remove(upLine), 100);
          }

          const upperHit = world.castRay(upperRay, SNAP_STEP_HEIGHT, true); // Cast downwards

          // If no obstacle directly above the step, or it's low enough to step over
          if (!upperHit) { // No collision directly above the step height
            // ✅ Snap up to the step point's Y plus a tiny buffer
            rigidbody.current.setTranslation(
              {
                x: pos.x, // Keep XZ movement continuous through physics
                y: stepPoint.y + 0.05, // Snap to step height + buffer
                z: pos.z,
              },
              true
            );
            // Apply impulse for continued forward movement after snap
            rigidbody.current.applyImpulse(
              {
                x: moveVec.x * speed,
                y: 0,
                z: moveVec.z * speed,
              },
              true
            );
          }
        }
      }

      // ✅ Always apply ground impulse (for continuous lateral movement)
      // This is crucial for constant movement feel, regardless of step snap checks
      rigidbody.current.applyImpulse(
        {
          x: moveVec.x * speed,
          y: 0,
          z: moveVec.z * speed,
        },
        true
      );
    }


    // --- JUMPING ---
    if (keys.current[" "] && isGrounded) {
      rigidbody.current.applyImpulse({
        x: 0,
        y: JUMP_FORCE,
        z: 0,
      }, true);
      setIsGrounded(false); // Start the jump and assume we are not grounded until we check again
    }

    // Get the current world position of the rigidbody
    const currentWorldPosition = new THREE.Vector3();
    // Corrected: Use rigidbody.current.translation() and copy its values to a THREE.Vector3
    currentWorldPosition.copy(rigidbody.current.translation());
    // Call the callback with the new position (as a THREE.Vector3)
    onPlayerPositionChange(currentWorldPosition);

    // --- CAMERA FOLLOW ---
    const position = rigidbody.current.translation();
    const offset = new THREE.Vector3();
    camera.getWorldPosition(offset);
    offset.sub(cameraControls.current._target);

    cameraControls.current._target.set(position.x, position.y + 1.5, position.z);
    cameraControls.current._needsUpdate = true;
    camera.position.copy(cameraControls.current._target).add(offset);

    // Screenshot logic - only runs once per 'p' press
    if (keys.current["p"]) {
      takeFirstPersonScreenshot();
      keys.current["p"] = false; // Prevent continuous screenshots
    }
    checkGrounded(); // Recheck if grounded every frame (lightweight operation)
  });

  return (
    <RigidBody
      ref={rigidbody}
      //position={[-5, -7.5, 3]}    // <--- spawn high in the air
      colliders={false} // CapsuleCollider is added manually below
      type="dynamic"
      friction={0.2}
      linearDamping={12}
      lockRotations
      {...props} // Pass through any additional props like initial position
    >
      <group ref={group}>
        <VRMAvatar avatar={avatar} isMoving={isMoving} />
      </group>

      {/* Collider dimensions should match VRMAvatar scale */}
      <CapsuleCollider args={[0.75, 0.3]} position={[0, 0.75, 0]} /> {/* Adjust height (1.75 -> 0.75) and position (2 -> 0.75) to better fit character */}
    </RigidBody>
  );
};