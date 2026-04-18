import { Billboard, CameraControls, Text, Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useRapier,
  CapsuleCollider,
  RigidBody,
  vec3,
} from "@react-three/rapier";
import { VRMAvatar } from "./VRMAvatar";
import * as THREE from "three";
import { screenshotEventEmitter } from "../utils/eventEmitter";
import { isPianoOpen, setPianoStateOpen } from "./UIStates";
import { SoundEmitter } from "./SoundEmitter";
import React, { useEffect, useRef, useState, useImperativeHandle, useMemo } from "react";
import { globalPlayerPosition } from './GlobalPositionStore';
import { useGLTF } from "@react-three/drei";
import { preloadAvatar, getAvatarUrlSync } from "./avatarCache";
import { getGlobalIsChatting } from "./Globals";

const MOVEMENT_SPEED = 3; // Base movement speed
const JUMP_FORCE = 5; // Adjust this for jump height

// New: Movement Modifiers
const SPRINT_SPEED_MULTIPLIER = 1.8; // How much faster sprinting is
const CROUCH_SPEED_MULTIPLIER = 0.5; // How much slower crouching is

// Character dimensions for collider
const STAND_CAPSULE_HEIGHT = 1.5; // Total character height when standing (capsule height + radius * 2)
const STAND_CAPSULE_RADIUS = 0.3;
const CROUCH_CAPSULE_HEIGHT = 0.8; // Total character height when crouching
const CROUCH_CAPSULE_RADIUS = 0.3;

const PLAYER_EYE_HEIGHT_STAND = 1.3; // Camera height when standing
const PLAYER_EYE_HEIGHT_CROUCH = 0.8; // Camera height when crouching

// Define fixed step snap parameters here for clarity
const SNAP_STEP_DISTANCE = 0.4; // Raycast distance for step detection
const SNAP_STEP_HEIGHT = 0.4; // How high a step the character can take

// === DEBUG SETTINGS ===
const DEBUG_STEP_RAYS = true; // Set to true to visualize step snap rays
const DEBUG_MOUSE_HOVER = true; // New debug setting for mouse hover

// New Aiming Camera Offsets (Adjust these values)
const AIMING_OFFSET_Z = -0.5; // How far in front of the player
const AIMING_OFFSET_Y = 0.5;  // How high above the ground
const AIMING_DISTANCE = 4.0; // The fixed distance from the player to the camera
const AIMING_POLAR_ANGLE = Math.PI * 0.45; // Slightly above horizontal view
const canvas = document.querySelector("canvas"); // if you only have one canvas

export const CharacterController = React.forwardRef(({
  carRef = null,
  avatar,
  cameraControls,
  world,
  onPlayerPositionChange,
  joystick,
  cameraSensitivity = 0.0001,
  isLocalPlayer = true,
  onFire,
  ...props
}, ref) => {
  const group = useRef();
  const character = useRef(); // This ref might not be strictly needed unless you're animating directly on it
  const rigidbody = useRef();
  const keys = useRef({});
  const monitorImage = useRef(""); // Stores the string
  const imgRef = useRef(null);      // Stores the HTML element
  const [isMoving, setIsMoving] = useState(false);
  const [isGrounded, setIsGrounded] = useState(true);
  const [isCrouching, setIsCrouching] = useState(false); // New: State for crouching
  const [isSprinting, setIsSprinting] = useState(false);
  const [isBowCharging, setIsBowCharging] = useState(false);
  const [isBowCharged, setIsBowCharged] = useState(false);
  const [isHoldingGun, setIsHoldingGun] = useState(false);
  
  
  const audioRef = useRef();
  // New State for Aiming
  const [isAiming, setIsAiming] = useState(false); // New state
  const [isJumping, setIsJumping] = useState(false); // New state for jumping

  const [isAI, setAI] = useState(false);
  const [isCapturing, setCapturing] = useState(false);
  const [steerDir, setSteer] = useState("stop");

  const moveVec = new THREE.Vector3();
  //const [currentWorldPosition, setCurrentWorldPosition] = useState(new THREE.Vector3());

  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    get rigidbody() {
      return rigidbody;
    },
    get userData() {
      return group.current?.userData;
    }
  }));
  

  // Set userData after mount
  useEffect(() => {
    if (group.current) {
      group.current.userData.name = "Player";
      group.current.userData.isTopLevel = true;
      group.current.userData.id = crypto.randomUUID();

    }
  }, []);

  const firstPersonCamera = useRef(
    new THREE.PerspectiveCamera(
      160,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
  );




  
  const { gl, scene } = useThree();
  const { rapier } = useRapier();
  //console.log("Camera params", cameraControls);
  // Optimized: Frame counter for throttling step snap checks
  const stepFrameCounter = useRef(0);
  const STEP_UPDATE_INTERVAL = 5; // Check for step snapping every 5 frames

  const allObjects = useRef([]);
  // Get a list of all renderable meshes in the scene
  useEffect(() => {
    // This is a simple way to get all meshes. For a large scene, you might want a more targeted approach.
    scene.traverse((object) => {
      if (object.isMesh && object.visible) {
        allObjects.current.push(object);
      }
    });
  }, [scene]);


  // Handle key presses
  useEffect(() => {

const handleKeyDown = (e) => {
  keys.current[e.key.toLowerCase()] = true;

  if(!getGlobalIsChatting()){
    if (!isPianoOpen() && e.key.toLowerCase() === "c") {
    setIsCrouching((prev) => !prev);
  }
  if (!isPianoOpen() && e.key.toLowerCase() === "x" && isLocalPlayer) {
    setIsAiming((prev) => {
      const newAiming = !prev;
      setIsBowCharged(false);
      setIsBowCharging(false);
      const canvas = document.querySelector("canvas");
      if (!canvas) return newAiming;

      // Pointer lock
      if (newAiming && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      } else if (!newAiming && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }

      // --- Add or remove crosshair ---
      const existing = document.getElementById("crosshair");
      if (newAiming && !existing) {
        const cross = document.createElement("div");
        cross.id = "crosshair";
        cross.style.position = "absolute";
        cross.style.top = "50%";
        cross.style.left = "50%";
        cross.style.width = "10px";
        cross.style.height = "10px";
        cross.style.marginLeft = "-5px";
        cross.style.marginTop = "-5px";
        cross.style.pointerEvents = "none";
        cross.style.zIndex = "1000";

        const vert = document.createElement("div");
        vert.style.position = "absolute";
        vert.style.backgroundColor = "white";
        vert.style.width = "2px";
        vert.style.height = "10px";
        vert.style.top = "0";
        vert.style.left = "50%";
        vert.style.transform = "translateX(-50%)";

        const horiz = document.createElement("div");
        horiz.style.position = "absolute";
        horiz.style.backgroundColor = "white";
        horiz.style.width = "10px";
        horiz.style.height = "2px";
        horiz.style.top = "50%";
        horiz.style.left = "0";
        horiz.style.transform = "translateY(-50%)";

        cross.appendChild(vert);
        cross.appendChild(horiz);
        document.body.appendChild(cross);
      } else if (!newAiming && existing) {
        existing.remove();
      }

      return newAiming;
    });
  }
  if (!isPianoOpen() && e.key.toLowerCase() === "z" && isLocalPlayer) {
    setIsAiming((prev) => {
      const newAiming = !prev;
      setIsBowCharged(false);
      setIsBowCharging(false);
      const canvas = document.querySelector("canvas");
      if (!canvas) return newAiming;

      // Pointer lock
      if (newAiming && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      } else if (!newAiming && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }

      // --- Add or remove crosshair ---
      const existing = document.getElementById("crosshair");
      if (newAiming && !existing) {
        const cross = document.createElement("div");
        cross.id = "crosshair";
        cross.style.position = "absolute";
        cross.style.top = "50%";
        cross.style.left = "50%";
        cross.style.width = "10px";
        cross.style.height = "10px";
        cross.style.marginLeft = "-5px";
        cross.style.marginTop = "-5px";
        cross.style.pointerEvents = "none";
        cross.style.zIndex = "1000";

        const vert = document.createElement("div");
        vert.style.position = "absolute";
        vert.style.backgroundColor = "white";
        vert.style.width = "2px";
        vert.style.height = "10px";
        vert.style.top = "0";
        vert.style.left = "50%";
        vert.style.transform = "translateX(-50%)";

        const horiz = document.createElement("div");
        horiz.style.position = "absolute";
        horiz.style.backgroundColor = "white";
        horiz.style.width = "10px";
        horiz.style.height = "2px";
        horiz.style.top = "50%";
        horiz.style.left = "0";
        horiz.style.transform = "translateY(-50%)";

        cross.appendChild(vert);
        cross.appendChild(horiz);
        document.body.appendChild(cross);
      } else if (!newAiming && existing) {
        existing.remove();
      }

      return newAiming;
    });
  }
  }
  
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

  useEffect(() => {
    const listener = new THREE.AudioListener();
    if (cameraControls.current.camera) {
      console.log("CameraControls instance for AI ready:", cameraControls.current);
      // now you can access .camera, .dampingFactor, etc.
      cameraControls.current.camera.add(listener); // attach to camera for 3D audio

    const sound = new THREE.PositionalAudio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load("/videos/hello-483.mp3", (buffer) => {
      sound.setBuffer(buffer);
      sound.setRefDistance(3); // how far the sound travels
      sound.setLoop(true);
      sound.setVolume(1);
      sound.play();
    });


    if (group.current) {
      group.current.add(sound);
      audioRef.current = sound;
    }

    return () => {
      sound.stop();
      cameraControls.current.camera.remove(listener);
    };
    }
  }, [cameraControls]);

const colormapJet = (t) => {
  t = Math.min(Math.max(t, 0), 1);
  const r = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 3.0), 0), 1);
  const g = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 2.0), 0), 1);
  const b = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 1.0), 0), 1);
  return [r * 255, g * 255, b * 255];
};

const takeDepthMap = () => {
  firstPersonCamera.current.fov = 80; // your desired FOV
  firstPersonCamera.current.updateProjectionMatrix();

  const width = 800;
  const height = 600;

  // --- Camera setup ---
  // Assuming THREE, rigidbody, etc., are defined in the scope
  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();
  const baseEye = new THREE.Vector3(
    position.x,
    position.y + (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
    position.z
  );
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
  const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));
  firstPersonCamera.current.position.copy(eye);
  firstPersonCamera.current.lookAt(baseEye.clone().add(direction));
  
  // *** CRITICAL STEP: Update the camera's matrices *before* using them ***
  firstPersonCamera.current.updateMatrixWorld();
  const inverseProjectionMatrix = firstPersonCamera.current.projectionMatrixInverse;
  const inverseViewMatrix = firstPersonCamera.current.matrixWorld;

  // --- Render depth texture (rest of the first half is the same) ---
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  renderTarget.depthTexture = new THREE.DepthTexture();
  renderTarget.depthTexture.type = THREE.UnsignedShortType;

  gl.setRenderTarget(renderTarget);
  gl.render(scene, firstPersonCamera.current);
  gl.setRenderTarget(null);

  // --- Shader to linearize depth --- (Same as before)
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDepth: { value: renderTarget.depthTexture },
      cameraNear: { value: firstPersonCamera.current.near },
      cameraFar: { value: firstPersonCamera.current.far },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      uniform sampler2D tDepth;
      uniform float cameraNear;
      uniform float cameraFar;
      varying vec2 vUv;

      float getLinearDepth(float z_b) {
        float z_n = z_b * 2.0 - 1.0;
        return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
      }

      void main() {
        float depth = texture2D(tDepth, vUv).x;
        float linearDepth = getLinearDepth(depth);
        float normalized = linearDepth / cameraFar;
        gl_FragColor = vec4(vec3(normalized), 1.0);
      }
    `,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
  quadScene.add(quad);

  const depthCanvasTarget = new THREE.WebGLRenderTarget(width, height);
  gl.setRenderTarget(depthCanvasTarget);
  gl.render(quadScene, quadCamera);
  gl.setRenderTarget(null);

  // --- Read pixels from GPU --- (Same as before)
  const pixels = new Uint8Array(width * height * 4);
  gl.readRenderTargetPixels(depthCanvasTarget, 0, 0, width, height, pixels);

  // --- Create final side-by-side canvas ---
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");

  // --- Perspective depth (left) --- (Same as before)
  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const j = ((height - 1 - y) * width + x) * 4; // flip vertically
      const value = pixels[j] / 255; // normalized 0..1
      const [r, g, b] = colormapJet(value);
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
// ----------------------------------------------------------------------
// --- CORRECTED: Top-down XZ map (right) ---
// ----------------------------------------------------------------------
  const tdImageData = ctx.createImageData(width, height);
  
  // Helper objects for geometric unprojection
  const normalizedDepth = new THREE.Vector4();
  const worldPosition = new THREE.Vector4();
  const origin = new THREE.Vector3(firstPersonCamera.current.position.x, firstPersonCamera.current.position.y, firstPersonCamera.current.position.z);
  
  // Define the extent of the XZ map. This is an arbitrary value that defines 
  // how much of the world the right canvas will show.
  const mapExtent = firstPersonCamera.current.far * 0.4; 
  const centerX = width / 2;
  const centerZ = height / 2;
  
  // We need the linear depth data, which is stored in the R channel of 'pixels'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Index into the depth data (flipped vertically)
      const depthDataIdx = ((height - 1 - y) * width + x) * 4; 
      
      const normalizedLinearDepth = pixels[depthDataIdx] / 255.0; // 0..1 normalized linear depth
      const depthValue = normalizedLinearDepth * firstPersonCamera.current.far; // Get the actual distance in world units
      
      // 1. Calculate Normalized Device Coordinates (NDC)
      // NDC range is [-1, 1]
      const x_ndc = (x / width) * 2 - 1;
      const y_ndc = (y / height) * 2 - 1;
      
      // 2. Unproject to View Space
      // The Z coordinate in NDC is based on the Z-buffer's value (depth map).
      // We need a ray direction vector in view space for unprojection.
      // Easiest way is to unproject a point on the far plane.
      
      normalizedDepth.set(x_ndc, y_ndc, 1.0, 1.0);
      normalizedDepth.applyMatrix4(inverseProjectionMatrix);
      
      // ray is a vector pointing from camera to a point on the far plane in view space
      const ray = new THREE.Vector3(normalizedDepth.x, normalizedDepth.y, -1.0).normalize();
      
      // 3. Scale the ray by the linear depth value to get the View Space position
      const viewPosition = ray.clone().multiplyScalar(depthValue);
      
      // 4. Transform to World Space
      worldPosition.set(viewPosition.x, viewPosition.y, viewPosition.z, 1.0);
      worldPosition.applyMatrix4(inverseViewMatrix);

      // 5. Project World XZ onto the canvas
      
      // Calculate world coordinates relative to the camera's XZ position
      const relX = worldPosition.x - origin.x;
      const relZ = worldPosition.z - origin.z;
      
      // Map the relative XZ coordinates (which are in world units) to canvas pixels
      // The mapExtent defines the width/height of the world shown on the canvas.
      const tdX = Math.floor((relX / mapExtent + 0.5) * width);
      // We flip Z/Y here so that points far from the camera appear at the bottom
      const tdZ = Math.floor(height - ((relZ / mapExtent + 0.5) * height)); 

      // Boundary check and coloring
      if (tdX >= 0 && tdX < width && tdZ >= 0 && tdZ < height) {
        const tdIdx = (tdZ * width + tdX) * 4;
        
        // Use the original color-mapped value for the perspective view
        const i_left = (y * width + x) * 4; // Index into the left-side data
        const value = imageData.data[i_left] / 255;
        const [r, g, b] = colormapJet(value);
        
        tdImageData.data[tdIdx] = r;
        tdImageData.data[tdIdx + 1] = g;
        tdImageData.data[tdIdx + 2] = b;
        tdImageData.data[tdIdx + 3] = 255;
      }
    }
  }
  ctx.putImageData(tdImageData, width, 0);


  // --- 3️⃣ Slope segmentation map (first-person) ---
let slopeImage = ctx.createImageData(width, height);

// --- Depth accessor ---
let getDepth = (x, y) => {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  return pixels[((height - 1 - y) * width + x) * 4] / 255;
};

// --- Create depth map array ---
const depthMap = new Float32Array(width * height);

// --- Compute slope and depth ---
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dC = getDepth(x, y);
    const dR = getDepth(x + 1, y);
    const dD = getDepth(x, y + 1);

    // Compute slope in screen space
    let slope = Math.sqrt((dR - dC) ** 2 + (dD - dC) ** 2);
    slope /= Math.max(dC, 0.03); // perspective compensation

    const threshold = 0.2; // floor slope threshold
    slope = slope > threshold ? slope * 50 : 0; // scale for visualization

    const [r, g, b] = colormapJet(slope);
    const i = (y * width + x) * 4;
    slopeImage.data[i] = r * 255;
    slopeImage.data[i + 1] = g * 255;
    slopeImage.data[i + 2] = b * 255;
    slopeImage.data[i + 3] = 255;

    // store depth
    depthMap[y * width + x] = dC;
  }
}
function drawTriangleInImageSmooth(image, width, height, v, p1, p2, color, depthMap, maxNearDistance = 0.1, slopeThreshold = 0.2) {
    const [r0, g0, b0, a0] = color;

    const area = (p1, p2, p3) =>
        (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2;
    const Area = Math.abs(area(p1, p2, v));

    const minX = Math.max(0, Math.floor(Math.min(p1.x, p2.x, v.x)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(p1.x, p2.x, v.x)));
    const minY = Math.max(0, Math.floor(Math.min(p1.y, p2.y, v.y)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(p1.y, p2.y, v.y)));

    // Detection flags
    let leftNear = false, rightNear = false;
    let leftSteep = false, rightSteep = false;

    const middleX = width / 2;

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const P = { x, y };
            const A1 = Math.abs(area(P, p2, v));
            const A2 = Math.abs(area(p1, P, v));
            const A3 = Math.abs(area(p1, p2, P));

            if (Math.abs(Area - (A1 + A2 + A3)) < 0.5) {
                const i = (y * width + x) * 4;

                const slopeR = image.data[i] / 255;
                const depth = depthMap[y * width + x];
                const nearG = depth < maxNearDistance ? 1 - depth / maxNearDistance : 0;

                const R = Math.min(1, slopeR) * 255;
                const G = Math.min(1, nearG) * 255;
                const B = b0;
                const A = a0;

                image.data[i] = R;
                image.data[i + 1] = G;
                image.data[i + 2] = B;
                image.data[i + 3] = A;

                // Detection thresholds
                if (x < middleX) {
                    if (depth < 0.003) leftNear = true;
                    if (slopeR > slopeThreshold) leftSteep = true;
                } else {
                    if (depth < 0.003) rightNear = true;
                    if (slopeR > slopeThreshold) rightSteep = true;
                }
            }
        }
    }

    return { leftNear, rightNear, leftSteep, rightSteep };
}

// --- 🟦 Band analysis (two triangles combined) ---
function analyzeBand(image, width, height, topLeft, topRight, bottomLeft, bottomRight, color, depthMap) {
    const t1 = drawTriangleInImageSmooth(image, width, height, topLeft, topRight, bottomRight, color, depthMap);
    const t2 = drawTriangleInImageSmooth(image, width, height, topLeft, bottomLeft, bottomRight, color, depthMap);

    // Merge both triangles' detections
    const leftNear = t1.leftNear || t2.leftNear;
    const rightNear = t1.rightNear || t2.rightNear;
    const leftSteep = t1.leftSteep || t2.leftSteep;
    const rightSteep = t1.rightSteep || t2.rightSteep;

    // --- 🚗 Steering decision logic ---
    let steer = "forward";

    if ((leftNear || leftSteep) && !(rightNear || rightSteep)) {
        steer = "right";
    } else if ((rightNear || rightSteep) && !(leftNear || leftSteep)) {
        steer = "left";
    } else if ((leftNear || leftSteep) && (rightNear || rightSteep)) {
        // Instead of stopping, choose the direction with more free space
        steer = Math.random() < 0.5 ? "left" : "right";
    }
    else if (!(leftNear || leftSteep) && !(rightNear || rightSteep)) {
        steer = "forward";
    }

    console.log("Steer:", steer, "| Left near:", leftNear, "steep:", leftSteep, "| Right near:", rightNear, "steep:", rightSteep);
    return steer;
}

// --- 🟦 Create and cut the triangle band ---
let vanishing = { x: width / 2, y: height / 2 - 20 };
let p1 = { x: width * 2 / 8, y: height - 1 };
let p2 = { x: (width * 6) / 8, y: height - 1 };

function interpolate(p1, p2, t) {
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

let topFrac = 0.4;
let bottomFrac = 0.7;

let topLeft = interpolate(vanishing, p1, topFrac);
let topRight = interpolate(vanishing, p2, topFrac);
let bottomLeft = interpolate(vanishing, p1, bottomFrac);
let bottomRight = interpolate(vanishing, p2, bottomFrac);

// --- 🔵 Analyze band and decide steering ---
const steer = analyzeBand(slopeImage, width, height, topLeft, topRight, bottomLeft, bottomRight, [0,0,255,180], depthMap);
console.log("Steer:", steer);
setSteer(steer);


// --- 🖼️ Display result ---
ctx.putImageData(slopeImage, 0, height);

// --- 4️⃣ Object-aware slope map ---
slopeImage = ctx.createImageData(width, height);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dC = getDepth(x, y);
    const dR = getDepth(x + 1, y);
    const dD = getDepth(x, y + 1);

    // Compute slope in screen space
    let slope = Math.sqrt((dR - dC) ** 2 + (dD - dC) ** 2);

    // Optional: reduce effect of far-away points (perspective compensation)
    slope /= Math.max(dC, 0.035); // ignore extremely small depths

    // Apply threshold: only mark objects steeper than typical floor
    const threshold = 0.2; // tweak this
    slope = slope > threshold ? slope * 50 : 0; // scale for visualization

    const [r, g, b] = colormapJet(slope);
    const i = (y * width + x) * 4;
    slopeImage.data[i] = r * 255;
    slopeImage.data[i + 1] = g * 255;
    slopeImage.data[i + 2] = b * 255;
    slopeImage.data[i + 3] = 255;
  }
}

ctx.putImageData(slopeImage, width, height);
  
// ----------------------------------------------------------------------
// --- NEW: Normal Map Calculation and Rendering (4th Panel) ---
// ----------------------------------------------------------------------

// *** New Shader for Normal Calculation ***
const normalQuadMaterial = new THREE.ShaderMaterial({
    uniforms: {
        tDepth: { value: renderTarget.depthTexture }, // Depth Texture from first render
        cameraNear: { value: firstPersonCamera.current.near },
        cameraFar: { value: firstPersonCamera.current.far },
        // Use the matrices calculated earlier
        inverseProjectionMatrix: { value: inverseProjectionMatrix }, 
        inverseViewMatrix: { value: inverseViewMatrix } 
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform mat4 inverseProjectionMatrix;
        uniform mat4 inverseViewMatrix;
        varying vec2 vUv;
        
        // Function to convert non-linear Z-buffer value (z_b) to linear view-space depth
        float getLinearDepth(float z_b) {
            float z_n = z_b * 2.0 - 1.0;
            return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
        }

        // Reconstruct World Position from UV and Depth
        vec3 getWorldPosition(float depth, vec2 uv) {
            // 1. Normalized Device Coordinates (NDC)
            vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0); // Z=1.0 for point on far plane
            
            // 2. Unproject to View Space (before division by W)
            vec4 view = inverseProjectionMatrix * ndc;
            view.z = -1.0; // Ensure ray points forward in view space
            view.w = 0.0; // It's a direction vector

            // 3. Normalize the ray
            vec3 ray = normalize(view.xyz);

            // 4. Scale by linear depth to get View Space Position
            vec3 viewPosition = ray * depth;

            // 5. Transform to World Space Position
            vec4 worldPos = inverseViewMatrix * vec4(viewPosition, 1.0);
            return worldPos.xyz;
        }

        void main() {
            vec2 texelSize = 1.0 / vec2(${width}.0, ${height}.0); // Size of one pixel in UV space
            
            // 1. Get Depth for current pixel and its neighbors
            float dC = texture2D(tDepth, vUv).x;
            float dR = texture2D(tDepth, vUv + vec2(texelSize.x, 0.0)).x;
            float dD = texture2D(tDepth, vUv + vec2(0.0, texelSize.y)).x;

            // Handle non-rendered (far/skybox) pixels - use 1.0 (far plane)
            if (dC == 1.0) {
                 gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black for sky/far background
                 return;
            }

            // 2. Convert non-linear depth to linear depth (World Distance)
            float linearDepthC = getLinearDepth(dC);
            float linearDepthR = getLinearDepth(dR);
            float linearDepthD = getLinearDepth(dD);

            // 3. Reconstruct World Positions for current pixel (C) and neighbors (R=Right, D=Down)
            vec3 pC = getWorldPosition(linearDepthC, vUv);
            vec3 pR = getWorldPosition(linearDepthR, vUv + vec2(texelSize.x, 0.0));
            vec3 pD = getWorldPosition(linearDepthD, vUv + vec2(0.0, texelSize.y));
            
            // 4. Calculate Vectors (derivatives)
            vec3 dPdx = pR - pC;
            vec3 dPdy = pD - pC;

            // 5. Calculate Normal (Cross Product of derivatives)
            vec3 normal = normalize(cross(dPdy, dPdx)); // dy x dx for right-handed coordinate system

            // 6. Output Normal (remap [-1, 1] to [0, 1] for RGB output)
            // Normal.xyz maps to gl_FragColor.rgb
            gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); 
        }
    `,
});

const normalQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), normalQuadMaterial);
const normalQuadScene = new THREE.Scene();
normalQuadScene.add(normalQuad);

const normalTarget = new THREE.WebGLRenderTarget(width, height);
gl.setRenderTarget(normalTarget);
gl.render(normalQuadScene, quadCamera); // Reuse quadCamera
gl.setRenderTarget(null);

// --- Read pixels from GPU for Normal Map ---
const normalPixels = new Uint8Array(width * height * 4);
gl.readRenderTargetPixels(normalTarget, 0, 0, width, height, normalPixels);


// --- Create final Normal Map canvas (4th panel: bottom right) ---
const normalImageData = ctx.createImageData(width, height);

// Define the segmentation parameters
const MAX_WALKABLE_SLOPE_DEGREES = 110; // Max angle from horizontal (e.g., 45 degrees)
const MIN_DOT_PRODUCT = Math.cos(MAX_WALKABLE_SLOPE_DEGREES * (Math.PI / 180)); // ~0.707 for 45 deg

// The World Up vector (Y-axis)
const worldUp = new THREE.Vector3(0, 1, 0); 

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const j = ((height - 1 - y) * width + x) * 4; // Flip vertically

        // The normal vector N is stored in normalPixels as [N.x, N.y, N.z] mapped from [-1, 1] to [0, 255]
        
        // 1. Un-normalize the Normal vector components back to [-1, 1] range
        const nx = (normalPixels[j] / 255.0) * 2.0 - 1.0;
        const ny = (normalPixels[j + 1] / 255.0) * 2.0 - 1.0;
        const nz = (normalPixels[j + 2] / 255.0) * 2.0 - 1.0;

        const surfaceNormal = new THREE.Vector3(nx, ny, nz);
        
        // 2. Calculate the dot product (cosine of the angle between Normal and World Up)
        const dotProduct = surfaceNormal.dot(worldUp); 
        // Note: The normal is already normalized in the shader, so the dot product is the cosine of the angle.

        let R, G, B;
        
        // 3. Segment based on walkability threshold
        if (dotProduct >= MIN_DOT_PRODUCT) {
            // **WALKABLE**: The surface is relatively flat (slope <= 45 deg)
            R = 255; 
            G = 0; 
            B = 0; // RED
        } else {
            // **NON-WALKABLE**: The surface is too steep (slope > 45 deg)
            R = 0; 
            G = 255; 
            B = 255; // CYAN (or any non-red color to indicate non-walkable)
        }

        // Apply colors to the ImageData
        normalImageData.data[i] = R; 
        normalImageData.data[i + 1] = G; 
        normalImageData.data[i + 2] = B; 
        normalImageData.data[i + 3] = 255;
    }
}
ctx.putImageData(normalImageData, width, height); // Position: (width, height) - bottom right

  // --- Display in new tab ---
  const dataUrl = canvas.toDataURL("image/png");
  
  const newTab = window.open();
  newTab.document.write(`
    <html>
      <head>
        <style>
          html, body { margin: 0; padding: 0; overflow: hidden; background: black; }
          img { display: block; width: 100vw; height: 100vh; object-fit: contain; }
        </style>
      </head>
      <body><img src="${dataUrl}" /></body>
    </html>
  `);
  newTab.document.close();
  
};

const lastPosition = useRef(null);
const lastRotation = useRef(null);
/*
const getNormalDataURL = (pixels, width, height) => {
    // Check if the helper canvas exists, if not, create it
    if (!window._normalCanvasHelper) {
        window._normalCanvasHelper = document.createElement('canvas');
        window._normalCanvasHelperCtx = window._normalCanvasHelper.getContext('2d', { willReadFrequently: true });
    }

    const canvas = window._normalCanvasHelper;
    const ctx = window._normalCanvasHelperCtx;

    canvas.width = width;
    canvas.height = height;

    const clampedValues = new Uint8ClampedArray(pixels.length);
    
    // WebGL (bottom-to-top) to Canvas (top-to-bottom) flip
    for (let y = 0; y < height; y++) {
        const srcRow = y * width * 4;
        const destRow = (height - 1 - y) * width * 4;
        clampedValues.set(pixels.subarray(srcRow, srcRow + width * 4), destRow);
    }

    const imgData = new ImageData(clampedValues, width, height);
    ctx.putImageData(imgData, 0, 0);

    return canvas.toDataURL('image/png');
};
*/


const takeDepthMapFast = () => {
    // --- Configure camera ---
    firstPersonCamera.current.fov = 80;
    firstPersonCamera.current.updateProjectionMatrix();

    const width = 800, height = 600;
    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();

    const baseEye = new THREE.Vector3(
        position.x,
        position.y + (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
        position.z
    );
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));
    
    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));
    firstPersonCamera.current.updateMatrixWorld();

    // --- NEW DELTA CALCULATIONS ---
    
    // Create Three.js instances from the raw physics objects
    const currentPosVec = new THREE.Vector3(position.x, position.y, position.z);
    const currentQuat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);

    // Calculate Delta Position
    const deltaPosition = lastPosition.current 
        ? new THREE.Vector3().subVectors(currentPosVec, lastPosition.current) 
        : new THREE.Vector3(0, 0, 0);

    // Calculate Delta Rotation using Euler angles for Pitch, Yaw, Roll
    const currentEuler = new THREE.Euler().setFromQuaternion(currentQuat, 'YXZ');
    const lastEuler = lastRotation.current 
        ? new THREE.Euler().setFromQuaternion(lastRotation.current, 'YXZ') 
        : new THREE.Euler(0, 0, 0, 'YXZ');

    // Standard 3D Convention: X = Pitch, Y = Yaw, Z = Roll
    const pitch = (currentEuler.x - lastEuler.x) * (180 / Math.PI); 
    const yaw   = (currentEuler.y - lastEuler.y) * (180 / Math.PI);   
    const roll  = (currentEuler.z - lastEuler.z) * (180 / Math.PI);  

    // Log the deltaPosition and deltaRotation in pitch, yaw, roll
    //console.log("Delta Position:", deltaPosition);
    //console.log("Delta Rotation (Pitch, Yaw, Roll):", pitch, yaw, roll);

    // Store clones of the Three.js objects for the next frame's comparison
    // 4. Update the refs for the next frame (No re-render triggered)
    lastPosition.current = currentPosVec.clone();
    lastRotation.current = currentQuat.clone();
    //console.log("Position and rotation:", position, rotation);


    // --- Render depth to texture ---
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
    });
    renderTarget.depthTexture = new THREE.DepthTexture();
    renderTarget.depthTexture.type = THREE.UnsignedShortType;

    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    // --- Calculate View and Projection Matrices for Shader Use ---
    const inverseProjectionMatrix = firstPersonCamera.current.projectionMatrix.clone().invert();
    const inverseViewMatrix = firstPersonCamera.current.matrixWorld.clone(); 

    // --- Skip depth map linearization (since we won't use the depth map data) ---
    // The depth map steps are kept ONLY to fulfill previous requirements 
    // and provide the full context, but are unnecessary for the new steering logic.
    
    // --- Read linearized depth data (UNNECESSARY FOR NEW LOGIC, KEPT FOR STRUCTURE) ---
    const pixels = new Uint8Array(width * height * 4);
    // gl.readRenderTargetPixels(depthCanvasTarget, 0, 0, width, height, pixels); 
    // Define these outside your loop/function to avoid garbage collection spikes
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    /**
     * Converts raw WebGL normal pixel data to a DataURL
     * @param {Uint8Array} pixels - The raw data from readRenderTargetPixels
     * @param {number} width 
     * @param {number} height 
     * @returns {string} The image/png DataURL
     */
    
    // --- Precompute depth map (UNNECESSARY FOR NEW LOGIC, KEPT FOR STRUCTURE) ---
    const depthMap = new Float32Array(width * height);
    // ... depth map population logic skipped ...


    // ----------------------------------------------------------------------
    // **Normal Map Calculation and Reading**
    // ----------------------------------------------------------------------

    // *** New Shader for Normal Calculation ***
    const normalQuadMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tDepth: { value: renderTarget.depthTexture }, // Depth Texture from first render
            cameraNear: { value: firstPersonCamera.current.near },
            cameraFar: { value: firstPersonCamera.current.far },
            inverseProjectionMatrix: { value: inverseProjectionMatrix },
            inverseViewMatrix: { value: inverseViewMatrix }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: `
            uniform sampler2D tDepth;
            uniform float cameraNear;
            uniform float cameraFar;
            uniform mat4 inverseProjectionMatrix;
            uniform mat4 inverseViewMatrix;
            varying vec2 vUv;
            
            float getLinearDepth(float z_b) {
                float z_n = z_b * 2.0 - 1.0;
                return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));
            }

            vec3 getWorldPosition(float depth, vec2 uv) {
                vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
                vec4 view = inverseProjectionMatrix * ndc;
                view.z = -1.0;
                view.w = 0.0;
                vec3 ray = normalize(view.xyz);
                vec3 viewPosition = ray * depth;
                vec4 worldPos = inverseViewMatrix * vec4(viewPosition, 1.0);
                return worldPos.xyz;
            }

            void main() {
                vec2 texelSize = 1.0 / vec2(${width}.0, ${height}.0);
                
                float dC = texture2D(tDepth, vUv).x;
                float dR = texture2D(tDepth, vUv + vec2(texelSize.x, 0.0)).x;
                float dD = texture2D(tDepth, vUv + vec2(0.0, texelSize.y)).x;

                // Black out far/unrendered pixels to avoid spurious normals
                if (dC == 1.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                }

                float linearDepthC = getLinearDepth(dC);
                float linearDepthR = getLinearDepth(dR);
                float linearDepthD = getLinearDepth(dD);

                vec3 pC = getWorldPosition(linearDepthC, vUv);
                vec3 pR = getWorldPosition(linearDepthR, vUv + vec2(texelSize.x, 0.0));
                vec3 pD = getWorldPosition(linearDepthD, vUv + vec2(0.0, texelSize.y));
                
                vec3 dPdx = pR - pC;
                vec3 dPdy = pD - pC;

                vec3 normal = normalize(cross(dPdy, dPdx)); 

                // Outputs normal normalized to [0, 1]: R=X, G=Y, B=Z
                gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); 
            }
        `,
    });
    const quadScene = new THREE.Scene();
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const normalQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), normalQuadMaterial);
    const normalQuadScene = new THREE.Scene();
    normalQuadScene.add(normalQuad);

    const normalTarget = new THREE.WebGLRenderTarget(width, height);
    gl.setRenderTarget(normalTarget);
    gl.render(normalQuadScene, quadCamera); // Reuse quadCamera
    gl.setRenderTarget(null);

    // --- Read pixels from GPU for Normal Map ---
    const normalPixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(normalTarget, 0, 0, width, height, normalPixels);

        // ----------------------------------------------------------------------
        // **SLOPE SEGMENTATION AND VISUALIZATION**
        // ----------------------------------------------------------------------
    
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const segmentedImageData = ctx.createImageData(width, height);
    
    
        // Define the segmentation parameters (Using 110 degrees as requested)
        const MAX_WALKABLE_SLOPE_DEGREES = 110; 
        // cos(110 degrees) is approx -0.342.
        const MIN_DOT_PRODUCT = Math.cos(MAX_WALKABLE_SLOPE_DEGREES * (Math.PI / 180)); 
        const WORLD_UP = new THREE.Vector3(0, 1, 0); 
    
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const j = ((height - 1 - y) * width + x) * 4; // Flip vertically
    
                // 1. Un-normalize the Normal vector components back to [-1, 1] range
                const nx = (normalPixels[j] / 255.0) * 2.0 - 1.0;
                const ny = (normalPixels[j + 1] / 255.0) * 2.0 - 1.0;
                const nz = (normalPixels[j + 2] / 255.0) * 2.0 - 1.0;
    
                const surfaceNormal = new THREE.Vector3(nx, ny, nz);
                
                // 2. Calculate the dot product (cosine of the angle between Normal and World Up)
                const dotProduct = surfaceNormal.dot(WORLD_UP); 
    
                let R, G, B;
                
                // 3. Segment based on walkability threshold (110 degrees)
                if (dotProduct >= MIN_DOT_PRODUCT) { 
                    // WALKABLE (Slope <= 110 degrees from vertical): Use Blue
                    R = 0; 
                    G = 0; 
                    B = 255; 
                } else {
                    // NON-WALKABLE / OBSTACLE (Slope > 110 degrees): Use Red
                    R = 255; 
                    G = 0; 
                    B = 0; 
                }
    
                // Apply colors to the Segmented ImageData
                segmentedImageData.data[i] = R; 
                segmentedImageData.data[i + 1] = G; 
                segmentedImageData.data[i + 2] = B; 
                segmentedImageData.data[i + 3] = 255;
            }
        }
    
        // Put the segmented data onto the canvas
        ctx.putImageData(segmentedImageData, 0, 0); 
    
        // ----------------------------------------------------------------------
        // **VISUALIZATION FIX: Draw Trapezoid Overlay using Canvas API**
        // ----------------------------------------------------------------------
    
        // --- Define band points (repeated from below for visualization use) ---
        let vanishing = { x: width / 2, y: height / 2 - 20 };
        let p1 = { x: width * 1 / 8, y: height - 1 };
        let p2 = { x: (width * 7) / 8, y: height - 1 };
    
        const interpolate = (p1, p2, t) => ({
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
        });
    
        let topFrac = 0.35;
        let bottomFrac = 0.7;
    
        let topLeft = interpolate(vanishing, p1, topFrac);
        let topRight = interpolate(vanishing, p2, topFrac);
        let bottomLeft = interpolate(vanishing, p1, bottomFrac);
        let bottomRight = interpolate(vanishing, p2, bottomFrac);
    
        // Set style for the trapezoid overlay (semi-transparent yellow)
        ctx.globalAlpha = 0.3; 
        ctx.fillStyle = 'yellow'; 
    
        // Begin drawing the trapezoid path
        ctx.beginPath();
    
        // Draw the perimeter: Start at topLeft, go clockwise/counter-clockwise
        ctx.moveTo(topLeft.x, topLeft.y);
        ctx.lineTo(topRight.x, topRight.y);
        ctx.lineTo(bottomRight.x, bottomRight.y);
        ctx.lineTo(bottomLeft.x, bottomLeft.y);
        
        // Close the path
        ctx.closePath();
        
        // Fill the entire trapezoid area"
        ctx.fill();
        
        // Reset global alpha
        ctx.globalAlpha = 1.0;
        // Convert the current canvas frame to a string
        const dataUrl = canvas.toDataURL("image/png");
        // 1. Update the data (silent)
        monitorImage.current = dataUrl;

        // 2. Update the UI (visual)
        if (imgRef.current) {
          // imgRef.current is the <img> element. 
          // HTMLImageElement has a .src property.
          imgRef.current.src = dataUrl;
        }


    const MAX_WALKABLE_SLOPE_DEGREES_LOGIC = 110; 
    const MIN_WALKABLE_DOT_PRODUCT_LOGIC = Math.cos(MAX_WALKABLE_SLOPE_DEGREES_LOGIC * (Math.PI / 180)); 

    const getObstacle = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;

        const j = ((height - 1 - y) * width + x) * 4;

        const nx = (normalPixels[j] / 255.0) * 2.0 - 1.0;     
        const ny = (normalPixels[j + 1] / 255.0) * 2.0 - 1.0; 
        const nz = (normalPixels[j + 2] / 255.0) * 2.0 - 1.0; 

        const surfaceNormal = new THREE.Vector3(nx, ny, nz);
        const dotProduct = surfaceNormal.y; 
        
        // isObstacle is true if the dot product is less than the 110 deg threshold
        const isObstacle = dotProduct > MIN_WALKABLE_DOT_PRODUCT_LOGIC;

        return isObstacle;
    };

    function drawTriangleInImageSmooth(width, height, v, p1, p2) { 
        const area = (p1, p2, p3) =>
            (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2;
        const Area = Math.abs(area(p1, p2, v));

        const minX = Math.max(0, Math.floor(Math.min(p1.x, p2.x, v.x)));
        const maxX = Math.min(width - 1, Math.ceil(Math.max(p1.x, p2.x, v.x)));
        const minY = Math.max(0, Math.floor(Math.min(p1.y, p2.y, v.y)));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(p1.y, p2.y, v.y)));

        let leftObstacle = false, rightObstacle = false;
        const middleX = width / 2;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const P = { x, y };
                const A1 = Math.abs(area(P, p2, v));
                const A2 = Math.abs(area(p1, P, v));
                const A3 = Math.abs(area(p1, p2, P));

                if (Math.abs(Area - (A1 + A2 + A3)) < 0.5) {
                    
                    const isObstacle = getObstacle(x, y);

                    if (x < middleX) {
                        if (isObstacle) leftObstacle = true;
                    } else {
                        if (isObstacle) rightObstacle = true;
                    }
                }
            }
        }

        return { leftSteep: leftObstacle, rightSteep: rightObstacle };
    }

    function analyzeBand(width, height, topLeft, topRight, bottomLeft, bottomRight) { 
        // Detection logic uses the two triangles that form the trapezoid
        const t1 = drawTriangleInImageSmooth(width, height, topLeft, topRight, bottomRight);
        const t2 = drawTriangleInImageSmooth(width, height, topLeft, bottomLeft, bottomRight);

        const leftObstacle = t1.leftSteep || t2.leftSteep;
        const rightObstacle = t1.rightSteep || t2.rightSteep;

        console.log("Left Obstacle", leftObstacle, " ", "Right Obstacle", rightObstacle);
        
        // Steering logic: Turn AWAY from the obstacle
        if (!leftObstacle && !rightObstacle) return "forward"; 
        if (!leftObstacle && rightObstacle) return "left"; // Blocked right -> turn left
        if (leftObstacle && !rightObstacle) return "right"; // Blocked left -> turn right
        if (leftObstacle && rightObstacle) return "backward"; // Blocked both -> default turn right (can be refined later)
        
        return "forward";
    }

    // Calling analyzeBand
    const steer = analyzeBand(width, height, topLeft, topRight, bottomLeft, bottomRight);
    setSteer(steer);

    return steer;
};

  // Screenshot functions (unchanged from your original code)
  const takeFirstPersonScreenshot = () => {
    if (!rigidbody.current) return;
    // Update FOV before rendering
    firstPersonCamera.current.fov = 80; // your desired FOV
    firstPersonCamera.current.updateProjectionMatrix();

    const position = rigidbody.current.translation();
    const rotation = rigidbody.current.rotation();

    const baseEye = new THREE.Vector3(
      position.x,
      position.y +
        (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
      position.z
    );
    const direction = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(rotation)
      .normalize();
    const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.05));

    firstPersonCamera.current.position.copy(eye);
    firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    const renderTarget = new THREE.WebGLRenderTarget(800, 600);
    gl.setRenderTarget(renderTarget);
    gl.render(scene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

    
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(800, 600);

    const brightnessFactor = 2;
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 800; x++) {
        const i = (y * 800 + x) * 4;
        const j = ((599 - y) * 800 + x) * 4;
        let r = pixels[j];
        let g = pixels[j + 1];
        let b = pixels[j + 2];
        r = Math.min(255, r * brightnessFactor);
        g = Math.min(255, g * brightnessFactor);
        b = Math.min(255, b * brightnessFactor);
        imageData.data[i] = r;
        imageData.data[i + 1] = g;
        imageData.data[i + 2] = b;
        imageData.data[i + 3] = pixels[j + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const newTab = window.open();
    newTab.document.write(`
        <html>
            <head>
                <style>
                    html, body { margin: 0; padding: 0; overflow: hidden; background: black; }
                    img { display: block; width: 100vw; height: 100vh; object-fit: contain; }
                </style>
            </head>
            <body>
                <img src="${dataUrl}" />
            </body>
        </html>
        `);
    newTab.document.close();
  };

  const W = 384, H = 144;
  const BASELINE = 0.1;
  const CAM_FOV = 70;
  const FOCAL = (W / 2) / Math.tan((CAM_FOV * Math.PI / 180) / 2);
  const SEARCH_RANGE = 24;
  const ROAD_WIDTH = 50; 
  const WALL_HEIGHT = 15;
  const CHUNK_SIZE = 100;
  const MIN_TEXTURE = 2; 
  const MIN_SAFE_DISTANCE = 3.5;
  const CLEAR_THRESHOLD = 20; 
  const MAX_SCAN_ANGLE = Math.PI / 1.8; 

  const camL = useRef(new THREE.PerspectiveCamera(80, W / H, 0.1, 100));
  const camR = useRef(new THREE.PerspectiveCamera(80, W / H, 0.1, 100));
  const [navMode, setNavMode] = useState('AUTO');
  const [cameraMode, setCameraMode] = useState('CHASE');
  const [robotPos, setRobotPos] = useState(new THREE.Vector3(0,0,0));
  const [navData, setNavData] = useState({ v: 0, hazard: false, depth: 100, state: 'INIT' });
  // MATCHING DEFAULTS FROM IMAGE
  const [settings, setSettings] = useState({ 
    speed: 0.4, 
    hazardDistance: 4.0, 
    steepness: 70,
    roi_h: 0.3, 
    roi_y: 0, 
    roi_w_bottom: 0.1, 
    roi_w_top: 0.15 
  });

  // --- Preallocated objects for performance ---
const renderTarget = new THREE.WebGLRenderTarget(800, 600);
const pixels = new Uint8Array(800 * 600 * 4);
const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const imageData = ctx.createImageData(800, 600);


const viewCanvas = document.createElement("canvas");
viewCanvas.width = 800;
viewCanvas.height = 600;
const viewCtx = viewCanvas.getContext("2d", { willReadFrequently: true });
const imageViewData = viewCtx.createImageData(800, 600);
const brightnessFactor = 1.2;

let lastSent = 0; // optional FPS limiter

// --- 1. Define these outside the function (inside your component) ---
//const targetL = new THREE.WebGLRenderTarget(W, H);
//const targetR = new THREE.WebGLRenderTarget(W, H);
const logic = useRef({
  v: 0, bh: 0, hh: 0,
  state: 'FORWARD',
  scanDir: 1, clearTicks: 0, originalHeading: 0,
});

// STEREO-FLOW FUSION SHADER (Restored with your Gradient logic)
const HAZARD_FRAGMENT_SHADER = `
  uniform sampler2D textureL;
  uniform sampler2D textureR;
  uniform sampler2D texturePrev;
  uniform float focal;
  uniform float baseline;
  uniform float hazardDistance;
  uniform float cosLimit;
  uniform float minTexture;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 texSize = vec2(1.0 / 384.0, 1.0 / 144.0);
    vec3 rgbL_orig = texture2D(textureL, vUv).rgb;
    float vL_orig = (rgbL_orig.r + rgbL_orig.g + rgbL_orig.b) / 3.0;

    // 1. STEREO DISPARITY (With Gradient Matching)
    float minSAD_S = 1e9;
    float bestD = 0.0;
    float maxVal = 0.0; float minVal = 1.0;

    for (int d = 0; d < 32; d++) {
      float sad = 0.0;
      float off = float(d) * texSize.x;
      for (int wy = -1; wy <= 1; wy++) {
        for (int wx = -1; wx <= 1; wx++) {
          vec2 winOff = vec2(float(wx), float(wy)) * texSize;
          float vL = (texture2D(textureL, vUv + winOff).r + texture2D(textureL, vUv + winOff).g + texture2D(textureL, vUv + winOff).b) / 3.0 + (hash(vUv + winOff) * 0.02);
          float vR = (texture2D(textureR, vUv + winOff - vec2(off, 0.0)).r + texture2D(textureR, vUv + winOff - vec2(off, 0.0)).g + texture2D(textureR, vUv + winOff - vec2(off, 0.0)).b) / 3.0 + (hash(vUv + winOff - vec2(off, 0.0)) * 0.02);
          
          float gradL = vL - ((texture2D(textureL, vUv + winOff + vec2(texSize.x, 0.0)).r + texture2D(textureL, vUv + winOff + vec2(texSize.x, 0.0)).g + texture2D(textureL, vUv + winOff + vec2(texSize.x, 0.0)).b) / 3.0);
          float gradR = vR - ((texture2D(textureR, vUv + winOff - vec2(off, 0.0) + vec2(texSize.x, 0.0)).r + texture2D(textureR, vUv + winOff - vec2(off, 0.0) + vec2(texSize.x, 0.0)).g + texture2D(textureR, vUv + winOff - vec2(off, 0.0) + vec2(texSize.x, 0.0)).b) / 3.0);
          
          sad += abs(vL - vR) * 0.5 + abs(gradL - gradR) * 2.0;
          if (d == 0) { maxVal = max(maxVal, vL); minVal = min(minVal, vL); }
        }
      }
      if (sad < minSAD_S) { minSAD_S = sad; bestD = float(d); }
    }

    float depth = (bestD > 0.5) ? (focal * baseline) / bestD : 100.0;
    float dzdx = dFdx(depth); float dzdy = dFdy(depth);
    float normZ = 1.0 / sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
    float textureRange = maxVal - minVal;
    float isHaz = (textureRange > minTexture && normZ < cosLimit && depth < hazardDistance) ? 1.0 : 0.0;

    // 2. OPTICAL FLOW (Briefly calculate for Mode 4)
    float minSAD_F = 1e9; vec2 flowVec = vec2(0.0);
    for (int oy = -2; oy <= 2; oy++) {
      for (int ox = -2; ox <= 2; ox++) {
        vec2 winOff = vec2(float(ox), float(oy)) * texSize;
        float vP = (texture2D(texturePrev, vUv + winOff).r + texture2D(texturePrev, vUv + winOff).g + texture2D(texturePrev, vUv + winOff).b) / 3.0;
        float sadF = abs(vL_orig - vP);
        if (sadF < minSAD_F) { minSAD_F = sadF; flowVec = vec2(float(ox), float(oy)); }
      }
    }

    // R: Depth, G: FlowX, B: FlowY, A: Disparity
    gl_FragColor = vec4(depth / 20.0, (flowVec.x + 2.0) / 4.0, (flowVec.y + 2.0) / 4.0, bestD / 32.0);
  }
`;

const gpu = useMemo(() => {
  const tL = new THREE.WebGLRenderTarget(W, H);
  const tR = new THREE.WebGLRenderTarget(W, H);
  const tPrev = new THREE.WebGLRenderTarget(W, H);
  const gT = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      textureL: { value: null }, textureR: { value: null }, texturePrev: { value: null },
      focal: { value: FOCAL }, baseline: { value: BASELINE },
      hazardDistance: { value: 4.0 }, cosLimit: { value: Math.cos(settings.steepness * Math.PI / 180) },
      minTexture: { value: 0.1 }
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: HAZARD_FRAGMENT_SHADER,
    extensions: { derivatives: true }
  });

  const copyMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: mat.vertexShader,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`
  });

  const pS = new THREE.Scene();
  const pC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  pS.add(mesh);
  return { tL, tR, tPrev, gT, mat, copyMat, pS, pC, mesh };
}, [gl]);

const [debugMode, setDebugMode] = useState('HAZARD');

useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === '1') setDebugMode('HAZARD');
    if (e.key === '2') setDebugMode('DEPTH');
    if (e.key === '3') setDebugMode('NORMAL');
    if (e.key === '4') setDebugMode('FLOW_COLOR');
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
let s = logic.current;

const thresholds = {
  variance: 0.05,
  edgeDensity: 0.1
};

const edgeDensityFromBuffer = (data, width, height) => {
    let edges = 0;
    const threshold = 30;

    const getGray = (x, y) => {
        const i = (y * width + x) * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 3;
    };

    // We skip edges for speed
    for (let y = 1; y < height - 1; y += 2) { // Step by 2 for performance
        for (let x = 1; x < width - 1; x += 2) {
            // Sobel kernels
            const gx = -getGray(x-1, y-1) + getGray(x+1, y-1) 
                       -2*getGray(x-1, y) + 2*getGray(x+1, y)
                       -getGray(x-1, y+1) + getGray(x+1, y+1);
            
            const gy = -getGray(x-1, y-1) - 2*getGray(x, y-1) - getGray(x+1, y-1)
                       +getGray(x-1, y+1) + 2*getGray(x, y+1) + getGray(x+1, y+1);

            if (Math.sqrt(gx * gx + gy * gy) > threshold) edges++;
        }
    }
    return edges / ((width/2) * (height/2));
};

const takeFirstPersonScreenshotFast = () => {
  if (!rigidbody.current || !group.current || !ctx) return;

  // 1. POSITIONING & ORIENTATION
  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();
  const bodyQuat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const scanRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.hh);
  const combinedQuat = bodyQuat.clone().multiply(scanRotation);

  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(combinedQuat).normalize();
  const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(combinedQuat).normalize();
  const eye = new THREE.Vector3(position.x, position.y + (isCrouching ? 0.8 : 1.6), position.z).add(direction.clone().multiplyScalar(0.05));

  firstPersonCamera.current.position.copy(eye);
  firstPersonCamera.current.lookAt(eye.clone().add(direction));

  // 2. DELTA CALCS FOR FLASK
  const currentPosVec = new THREE.Vector3(position.x, position.y, position.z);
  const deltaPosition = lastPosition.current ? new THREE.Vector3().subVectors(currentPosVec, lastPosition.current) : new THREE.Vector3(0,0,0);
  const currentEuler = new THREE.Euler().setFromQuaternion(bodyQuat, 'YXZ');
  const lastEuler = lastRotation.current ? new THREE.Euler().setFromQuaternion(lastRotation.current, 'YXZ') : new THREE.Euler(0,0,0,'YXZ');
  const pitch = (currentEuler.x - lastEuler.x) * (180 / Math.PI);
  const yaw = (currentEuler.y - lastEuler.y) * (180 / Math.PI);

  lastPosition.current = currentPosVec.clone();
  lastRotation.current = bodyQuat.clone();

  // 3. RENDER CORE VIEW
  gl.setRenderTarget(renderTarget);
  gl.render(scene, firstPersonCamera.current);
  gl.setRenderTarget(null);
  gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

  const viewData = imageViewData.data;
  for (let y = 0; y < 600; y++) {
    const row = (599 - y) * 800 * 4;
    for (let x = 0; x < 800; x++) {
      const j = row + x * 4;
      const i_v = (y * 800 + x) * 4;
      viewData[i_v] = Math.min(255, pixels[j] * brightnessFactor);
      viewData[i_v+1] = Math.min(255, pixels[j+1] * brightnessFactor);
      viewData[i_v+2] = Math.min(255, pixels[j+2] * brightnessFactor);
      viewData[i_v+3] = 255;
    }
  }
  viewCtx.putImageData(imageViewData, 0, 0);
  // --- Convert to blob and send directly to Flask ---
  // --- 3.5 WALL DETECTION INTEGRATION ---
  // We use the 'pixels' array (Uint8Array) directly to avoid context overhead
  const width = 800;
  const height = 600;

  // Calculate Variance (Mean is roughly approximated or pre-calculated)
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
      sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
  }
  let varianceSum = 0;
  // 1. Calculate Mean and Variance (as you already have)
const mean = sum / (width * height);
const currentVariance = varianceSum / (width * height);
const density = edgeDensityFromBuffer(pixels, width, height);

// 2. Add a 'Darkness' factor 
// If mean is very low (e.g., < 20), we treat it as a potential obstacle regardless of texture
const darknessPenalty = mean < 20 ? (20 - mean) * 2 : 0;

// 3. Refined Score Formula
// We use a small epsilon to prevent Infinity, but we also check if the 
// low variance is actually just "darkness" vs a "white wall"
const score = (1 / (currentVariance + 0.1)) + (1 / (density + 0.01)) + darknessPenalty;

// 4. Logic Gate
// If the variance is extremely low but the mean is also low, it's a wall.
// If the variance is low but mean is high, it's a bright flat surface (also a wall).
const isFlatSurface = currentVariance < 1.0; // Almost no pixel variation
const isSolidColor = density < 0.005;         // Almost no edges detected

// If it's perfectly flat AND we are in AUTO mode, it's a wall.
const blankWallDetected = isFlatSurface && isSolidColor;

const isWallDetected = score > 100 || blankWallDetected;

if (isWallDetected) {
  console.log("WALL DETECTED - Score:", score.toFixed(2), "Mean:", mean.toFixed(2));
}
  // --- Update State Machine ---

  viewCanvas.toBlob((blob) => {
    if (!blob) return;
    const formData = new FormData();
    formData.append("frame", blob, "frame.jpg");
    formData.append("pitch", pitch);
    formData.append("yaw", yaw);
    //formData.append("roll", roll);
    formData.append("deltaPosition", deltaPosition);

    fetch("http://localhost:5000/upload_frame", {
      method: "POST",
      body: formData,
      keepalive: true, // ✅ allows sending even if frame drops
    }).catch(() => {});
  }, "image/jpeg", 0.6);

  // 4. GPU STEREO/FLOW
  group.current.visible = false;
  [ [camL, gpu.tL, -1], [camR, gpu.tR, 1] ].forEach(([cam, target, side]) => {
    cam.current.position.copy(eye.clone().add(rightVec.clone().multiplyScalar((side * BASELINE) / 2)));
    cam.current.lookAt(cam.current.position.clone().add(direction));
    gl.setRenderTarget(target);
    gl.render(scene, cam.current);
  });

  gpu.mesh.material = gpu.mat;
  gpu.mat.uniforms.textureL.value = gpu.tL.texture;
  gpu.mat.uniforms.textureR.value = gpu.tR.texture;
  gpu.mat.uniforms.texturePrev.value = gpu.tPrev.texture;
  gl.setRenderTarget(gpu.gT);
  gl.render(gpu.pS, gpu.pC);

  const res = new Float32Array(W * H * 4);
  const pix = new Uint8Array(W * H * 4);
  gl.readRenderTargetPixels(gpu.gT, 0, 0, W, H, res);
  gl.readRenderTargetPixels(gpu.tL, 0, 0, W, H, pix);

  gpu.mesh.material = gpu.copyMat;
  gpu.copyMat.uniforms.tDiffuse.value = gpu.tL.texture;
  gl.setRenderTarget(gpu.tPrev); gl.render(gpu.pS, gpu.pC);
  gl.setRenderTarget(null); group.current.visible = true;

  // 5. ANALYTICS & PROXIMITY FILTER
  const data = imageData.data;
  let totalHazardWeight = 0, steerBiasSum = 0;

  for (let y = 0; y < 600; y++) {
    const cRow = (599 - y) * 800 * 4;
    const srcY = Math.floor((y / 600) * H);
    const relY = srcY / H;
    const roiYEnd = settings.roi_y + settings.roi_h;
    const t = Math.max(0, Math.min(1, (roiYEnd - relY) / settings.roi_h));
    const curWidth = settings.roi_w_bottom + (t * (settings.roi_w_top - settings.roi_w_bottom));

    for (let x = 0; x < 800; x++) {
      const srcX = Math.floor((x / 800) * W);
      const relX = (srcX - (W / 2)) / (W / 2);
      const i = (srcY * W + srcX) * 4;
      const cIdx = cRow + x * 4;

      const depth = res[i] * 20.0;
      const fx = (res[i+1] * 4.0) - 2.0;
      const fy = (res[i+2] * 4.0) - 2.0;
      const disparity = res[i+3] * 32.0;
      
      const inProximity = disparity >= 10.0 && disparity <= 32.0;
      const isHaz = inProximity && Math.sqrt(fx*fx + fy*fy) > 1.2;
      const inROI = relY >= settings.roi_y && relY <= roiYEnd && Math.abs(relX) <= curWidth;

      if (debugMode === 'DEPTH') {
        const dVis = res[i+3] * 255; data[cIdx] = dVis; data[cIdx+1] = dVis; data[cIdx+2] = dVis;
      } else if (debugMode === 'NORMAL') {
        data[cIdx] = 100; data[cIdx+1] = (1.0 - res[i]) * 255; data[cIdx+2] = 200;
      } else if (debugMode === 'FLOW_COLOR') {
        // Mode 4: Flow Color + Proximity Filter visualization
        data[cIdx] = inProximity ? 255 : 127 + fx * 40;
        data[cIdx+1] = 127 + fy * 40;
        data[cIdx+2] = inProximity ? 0 : 255 - Math.sqrt(fx*fx + fy*fy) * 30;
      } else {
        if (isHaz) { data[cIdx] = 255; data[cIdx+1] = 0; data[cIdx+2] = 0; }
        else if (inROI) { data[cIdx] = 0; data[cIdx+1] = 70; data[cIdx+2] = 140; }
        else { data[cIdx] = pix[i]*2; data[cIdx+1] = pix[i+1]*2; data[cIdx+2] = pix[i+2]*2; }
      }
      data[cIdx+3] = 255;

      if (isHaz && inROI) {
        const w = (disparity - 10.0) / 22.0;
        totalHazardWeight += w; steerBiasSum += relX * w;
      }
    }
  }

  // 6. STATE MACHINE (Restored with s.bh)
  const isDetected = totalHazardWeight > 10.0;
  const avgBias = totalHazardWeight > 0 ? steerBiasSum / totalHazardWeight : 0;
  
  if (navMode === 'MANUAL') {
    
  } else {
    switch (s.state) {
      case 'FORWARD':
        setIsMoving(true); 
        s.v = settings.speed;
        
        // 1. Smoothly reset head offset (s.hh) to center
        // This pulls the camera back to "forward" after a scan or evade
        s.hh *= 0.15; 

        const cp = rigidbody.current.translation();
  
        // 2. Check for arrival
        const dx = 100 - cp.x;
        const dz = 100 - cp.z;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < 2.0) {
          s.state = 'ARRIVED';
          break;
        }

        // 3. Navigation Physics
        const targetYaw = Math.atan2(100 - cp.x, 100 - cp.z);
        let diff = targetYaw - s.bh;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        s.bh += diff * 0.3; // Body turns toward goal

        // 4. Hazard Transition
        if (totalHazardWeight > 10.0) s.state = 'SCANNING';
        if (isWallDetected) s.state = 'SCANNING';

        moveVec.set(Math.sin(s.bh), 0, Math.cos(s.bh));
        break;

      case 'ARRIVED':
        s.v = 0;
        setIsMoving(false);
        break;

      case 'SCANNING':
        s.v = 0; 
        setIsMoving(false);
        
        // Head moves side to side, body stays still
        s.hh += s.scanDir * 0.3; 
        if (Math.abs(s.hh) > 1.5) s.scanDir *= -1;

        if(!isWallDetected){
          if (totalHazardWeight < 4.0) { 
            s.targetEvadeYaw = s.bh + s.hh; // Set new path based on where we are looking
            s.state = 'EVADING'; 
            s.evadeStartTime = Date.now(); 
          }
        } else {
          s.evadeStartTime = Date.now(); 
          s.state = 'REVERSE';
        }
        
        
        break;
      case 'REVERSE':
        setIsMoving(true);
        s.v = settings.speed; // Keep speed positive if moveVec handles direction

        // Invert the sin/cos to point backwards
        moveVec.set(-Math.sin(s.bh), 0, -Math.cos(s.bh));
        
        // Timer to transition back to SCANNING
        if (Date.now() - s.evadeStartTime > 500) {
          let eDiff = s.targetEvadeYaw - s.bh;
          s.bh += eDiff * 0.3; // Body turns toward evasion target
          s.state = 'SCANNING';
        }
        break; // <--- This MUST be here to stop it from running 'EVADING'
      case 'EVADING':
        setIsMoving(true); 
        s.v = settings.speed;

        // Pull head back to center during the movement
        s.hh *= 0.1; 

        let eDiff = s.targetEvadeYaw - s.bh;
        while (eDiff < -Math.PI) eDiff += Math.PI * 2;
        while (eDiff > Math.PI) eDiff -= Math.PI * 2;
        
        s.bh += eDiff * 0.3; // Body turns toward evasion target
        
        moveVec.set(Math.sin(s.bh), 0, Math.cos(s.bh));

        if (Date.now() - s.evadeStartTime > 1000) {
          s.state = 'FORWARD';
        }
        break;
    }
  }

  // 7. HUD
  ctx.putImageData(imageData, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(20, 20, 280, 150);
  ctx.strokeStyle = "#00FF41"; ctx.strokeRect(20, 20, 280, 150);
  ctx.font = "bold 18px monospace"; ctx.fillStyle = "#00FF41";
  ctx.fillText(`NAV: ${navMode}`, 40, 50);
  ctx.font = "12px monospace"; ctx.fillStyle = "white";
  ctx.fillText(`STATE: ${s.state} | MODE: ${debugMode}`, 40, 75);
  ctx.fillText(`PROXIMITY: [10-32]px`, 40, 95);
  ctx.fillStyle = isDetected ? "#FF3131" : "#00FF41";
  ctx.fillText(`HZ_LVL: ${totalHazardWeight.toFixed(1)}`, 40, 120);

  const dataUrl = canvas.toDataURL("image/png");
  monitorImage.current = dataUrl;
  if (imgRef.current) imgRef.current.src = dataUrl;
  const now = performance.now();
  if (now - lastSent < 33) return;
  lastSent = now;
};

  const takeFirstPersonScreenshotEvent = () => {
  if (!rigidbody.current) return;

  // 1. Setup Camera Position & Rotation
  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();

  const baseEye = new THREE.Vector3(
    position.x,
    position.y + (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND),
    position.z
  );

  const direction = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(rotation)
    .normalize();
  
  const eye = baseEye.clone().add(direction.clone().multiplyScalar(0.01));

  firstPersonCamera.current.position.copy(eye);
  firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

  // 2. Create Render Target (Fixed 800x600)
  const renderTarget = new THREE.WebGLRenderTarget(800, 600);
  gl.setRenderTarget(renderTarget);
  gl.render(scene, firstPersonCamera.current);
  gl.setRenderTarget(null);

  // 3. Read Pixels from the GPU
  const pixels = new Uint8Array(800 * 600 * 4);
  gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

  // 4. Prepare Canvas for JPEG conversion
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  
  // Important for JPEG: Fill background with black (or any color) 
  // so transparent areas don't look glitchy
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 800, 600);

  const imageData = ctx.createImageData(800, 600);

  // 5. Pixel Loop: Flip Y-axis and Apply Brightness
  const brightnessFactor = 2;
  
  for (let y = 0; y < 600; y++) {
    for (let x = 0; x < 800; x++) {
      // i: Canvas index (standard)
      // j: WebGL index (flipped vertically)
      const i = (y * 800 + x) * 4;
      const j = ((599 - y) * 800 + x) * 4;

      // Apply brightness and clamp to 255
      imageData.data[i]     = Math.min(255, pixels[j] * brightnessFactor);     // R
      imageData.data[i + 1] = Math.min(255, pixels[j + 1] * brightnessFactor); // G
      imageData.data[i + 2] = Math.min(255, pixels[j + 2] * brightnessFactor); // B
      imageData.data[i + 3] = 255; // Force Alpha to full for JPEG
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // 6. Output as JPEG
  // Second argument (0.85) is the quality (0.0 to 1.0)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  // 7. Clean up memory
  renderTarget.dispose();

  // 8. Dispatch
  screenshotEventEmitter.dispatchEvent(
    new CustomEvent("screenshotTaken", { 
      detail: { imageData: dataUrl } 
    })
  );
};

  // Effect to listen for the screenshot request event
  useEffect(() => {
    const handleRequestScreenshot = () => {
      console.log("Screenshot request received. Taking screenshot...");
      takeFirstPersonScreenshotEvent();
    };

    screenshotEventEmitter.addEventListener(
      "requestScreenshot",
      handleRequestScreenshot
    );

    return () => {
      screenshotEventEmitter.removeEventListener(
        "requestScreenshot",
        handleRequestScreenshot
      );
    };
  }, [rigidbody, firstPersonCamera, gl, scene, isCrouching]); // Added isCrouching to dependencies

  // Check if the character is grounded

// New: Grounding Raycast Parameters
const GROUND_CHECK_RAY_LENGTH = 0.75; // How far down to check for ground
const GROUND_CHECK_OFFSET = -0.15; // Offset from the character's base

// Check if the character is grounded
const checkGrounded = (moveVec) => {
  if (!rigidbody.current) return;

  const position = rigidbody.current.translation();
  const rotation = rigidbody.current.rotation();
  const radius = isCrouching ? CROUCH_CAPSULE_RADIUS : STAND_CAPSULE_RADIUS;

  // 1. Define the Ray Origin
  // Cast from the very bottom of the capsule collider + a tiny offset
  const rayOrigin = new rapier.Vector3(
    position.x + 0.5,
    position.y + 0.04,
    position.z + 0.5
  );
  
  
  // 2. Define the Ray Direction (Straight down)
  const rayDirection = new rapier.Vector3(0, -1, 0);

  // 3. Create the Rapier Ray
  const ray = new rapier.Ray(rayOrigin, rayDirection);

  // 4. Cast the Ray
  // The 'true' argument means we exclude the collider of the character itself from the hit results.
  const hit = world.castRay(ray, GROUND_CHECK_RAY_LENGTH, true);

  // 5. Determine Grounded Status
  // If the ray hits something within the defined length, the character is grounded.
  const isCurrentlyGrounded = !!hit && hit.collider.parent()?.handle !== rigidbody.current.handle;
  setIsGrounded(isCurrentlyGrounded);

  // Optional: Debug drawing for the grounded ray
  if (DEBUG_STEP_RAYS) { // Reusing your existing debug flag
      const start = new THREE.Vector3().copy(rayOrigin);
      const end = new THREE.Vector3(
        rayOrigin.x,
        rayOrigin.y - GROUND_CHECK_RAY_LENGTH,
        rayOrigin.z
      );
      const geometry = new THREE.BufferGeometry().setFromPoints([
          start,
          end,
      ]);
      const material = new THREE.LineBasicMaterial({ color: isCurrentlyGrounded ? 0x00ff00 : 0xff0000 });
      const debugLine = new THREE.Line(geometry, material);
      scene.add(debugLine);
      setTimeout(() => scene.remove(debugLine), 100);
  }

  //console.log("isGrounded:", isCurrentlyGrounded);

};

  // --- Raycast references (minor optimization, avoiding re-creation) ---
  // Initialize with actual Rapier.Vector3 objects
  // --- Raycast references (minor optimization, avoiding re-creation) ---
  // Initialize with actual Rapier.Vector3 objects
  const forwardRayOrigin = useRef(new rapier.Vector3(0, 0, 0));
  const forwardRayDir = useRef(new rapier.Vector3(0, 0, 0));
  const upperRayOrigin = useRef(new rapier.Vector3(0, 0, 0));
  const downwardRayDir = useRef(new rapier.Vector3(0, -1, 0)); // Fixed downward direction
  // Handle movement, jumping, and rotation each frame
  
  // --- Keep track of yaw/pitch ---
const yaw = useRef(0);   // horizontal rotation
const pitch = useRef(0); // vertical rotation

// --- Mouse move listener ---
const onMouseMove = (event) => {
  if (!isAiming) return;

  const sensitivity = 0.0001; // adjust to taste
  yaw.current   -= event.movementX * sensitivity;
  pitch.current -= event.movementY * sensitivity;

  // Clamp pitch to avoid flipping
  const maxPitch = Math.PI / 2 - 0.1;
  const minPitch = -Math.PI / 2 + 0.1;
  pitch.current = Math.max(minPitch, Math.min(maxPitch, pitch.current));
};

window.addEventListener("mousemove", onMouseMove);
  let cameraForward = new THREE.Vector3();
// At the top of your component

  useFrame(() => {
    if (!cameraControls?.current || !rigidbody.current) return;
    

    const camera = cameraControls.current.camera;
    let direction = new THREE.Vector3();
    if (!isAiming){
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
    }
    
    
    // Determine current speed based on sprinting and crouching
    let currentSpeed = MOVEMENT_SPEED;
    // 1. Determine if the user is TRYING to sprint (Shift or Joystick)
    const tryingToSprint = keys.current["shift"] || (joystick?.current && joystick.current.y < -0.8);

    // 2. Apply "modifiers" (You can't sprint if you are crouching or aiming)
    const isCurrentlySprinting = tryingToSprint && !isCrouching;
    setIsSprinting(isCurrentlySprinting); // Update sprint state

    if (isCurrentlySprinting) {
      currentSpeed *= SPRINT_SPEED_MULTIPLIER;
    }
    if (isCrouching) {
      currentSpeed *= CROUCH_SPEED_MULTIPLIER;
    }
    if (rigidbody.current && carRef){
      try{
        rigidbody.current.setTranslation({x: carRef.current.translation().x, y: carRef.current.translation().y + 1, z: carRef.current.translation().z}, true);
      } catch (error) {
        //console.error("Error setting car position:", error);
      }
    }
    // Movement vector accumulator
    if(!isCapturing){
      moveVec.set(0,0,0);
    }
    
    
    // Get the current velocity, so we can preserve the Y component
    const velocity = rigidbody.current.linvel();

    // --- JOYSTICK INPUT ---
    // It's possible for joystick.current to be null/undefined for a few frames
    if (joystick && joystick.current && isLocalPlayer) {

      // Toggle crouch via joystick button if available
      if (
        joystick.current.crouchButton &&
        !joystick.current.crouchButtonHandled
      ) {
        // Assuming a flag to prevent multiple toggles on one press
        setIsCrouching((prev) => !prev);
        joystick.current.crouchButtonHandled = true; // Set flag to true after handling
      } else if (!joystick.current.crouchButton) {
        joystick.current.crouchButtonHandled = false; // Reset flag when button is released
      }

      if (joystick.current.x !== 0 || joystick.current.y !== 0) {
        // If joystick is active, prioritize its input for movement direction
        moveVec.set(0, 0, 0); // Clear keyboard input if joystick is moving
        const forwardJoystick = direction
          .clone()
          .multiplyScalar(-joystick.current.y);
        const rightJoystick = new THREE.Vector3(-direction.z, 0, direction.x)
          .normalize()
          .multiplyScalar(joystick.current.x);
        moveVec.add(forwardJoystick).add(rightJoystick);
      }

      // Conceptual: Apply joystick right stick for camera rotation
      // This assumes your joystick provides 'lookX' and 'lookY' values from a right stick
      // You would need to pass these from your joystick component.
      /*
          if (joystick.current.lookX !== 0) {
              cameraControls.current.azimuthAngle -= joystick.current.lookX * cameraSensitivity;
          }
          if (joystick.current.lookY !== 0) {
              cameraControls.current.polarAngle += joystick.current.lookY * cameraSensitivity;
              // Clamp polar angle to prevent camera going upside down
              cameraControls.current.polarAngle = Math.max(0.1, Math.min(Math.PI - 0.1, cameraControls.current.polarAngle));
          }
          */
    }
    

    
    // --- JUMPING ---
    // You might want to prevent jumping while crouching or adjust jump force
    if (!isPianoOpen()){
        
        if (keys.current[" "] && isGrounded && !isCrouching && !getGlobalIsChatting()) {
          // Start jump
          setIsJumping(true); // start jump animation/state

          // Reset jumping state after a short delay (e.g., 3 seconds)
          setTimeout(() => {
            setIsJumping(false);

            // Apply jump velocity immediately
            rigidbody.current.setLinvel(
              {
                x: velocity.x,
                y: JUMP_FORCE,
                z: velocity.z,
              },
              true
            );
          }, 200);
        }
    }
    //console.log("isJump:", joystick.current.isJump);

    if (joystick.current.isJump) {
      if (isGrounded) {
        // Start jump
        setIsJumping(true); // start jump animation/state

        // Reset jumping state after a short delay (e.g., 3 seconds)
        setTimeout(() => {
          setIsJumping(false);

          // Apply jump velocity immediately
          rigidbody.current.setLinvel(
            {
              x: velocity.x,
              y: JUMP_FORCE,
              z: velocity.z,
            },
            true
          );
        }, 200);
      }
    }
    // Get the current world position of the rigidbody
    const currentWorldPosition = rigidbody.current.translation();
    //setCurrentWorldPosition(rigidbody.current.translation());
    if (isLocalPlayer) {
      // Update the global player position
      globalPlayerPosition.set(currentWorldPosition.x, currentWorldPosition.y, currentWorldPosition.z);
    }

    // --- CAMERA FOLLOW ---
    if (isLocalPlayer) {
    const position = rigidbody.current.translation();
    const offset = new THREE.Vector3();
    camera.getWorldPosition(offset);
    offset.sub(cameraControls.current._target);

    // Adjust camera target based on crouching state
    const targetY =
      position.y +
      (isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND);

    // Set the camera target at player position
    cameraControls.current._target.set(position.x, targetY, position.z);

      //console.log("offset", offset);

      // If the player is aiming, lock the camera behind them
// --- In your aiming camera update ---

if (isAiming) {
  // Compute direction from yaw/pitch
  cameraForward = new THREE.Vector3(
    Math.sin(yaw.current) * Math.cos(pitch.current),
    Math.sin(pitch.current),
    Math.cos(yaw.current) * Math.cos(pitch.current)
  ).normalize();

  direction = cameraForward;

  // Right vector
  const cameraRight = new THREE.Vector3();
  cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();

  // Distance offsets
  const backwardDistance = offset.length();
  const rightOffset = 0.25;
  const heightOffset = 1;

  // Camera position relative to player
  const cameraPos = new THREE.Vector3()
    .copy(position)
    .addScaledVector(cameraForward, -backwardDistance)
    .addScaledVector(cameraRight, rightOffset);
  cameraPos.y += heightOffset;

  camera.position.copy(cameraPos);

  // Optional: make camera look at player head
  const lookAtPos = new THREE.Vector3().copy(position);
  lookAtPos.addScaledVector(cameraRight, rightOffset);

  lookAtPos.y += heightOffset;

  camera.lookAt(lookAtPos);

  // Rotate player horizontally
  const horizontalForward = cameraForward.clone();
  horizontalForward.y = 0;
  horizontalForward.normalize();
  const angle = Math.atan2(horizontalForward.x, horizontalForward.z);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
  rigidbody.current.setRotation(q, true);
}

else {
  // Normal third-person follow mode
  camera.position.copy(cameraControls.current._target).add(offset);
}


    if (!isPianoOpen() && isLocalPlayer && !getGlobalIsChatting()){
      
      if(!isCapturing){
        // --- KEYBOARD INPUT ---
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
      }
      else if(isAI){
        // --- AI INPUT ---
        if (steerDir === "left") {
          moveVec.add(direction);
          const left = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
          moveVec.add(left);
        }
        if (steerDir === "right") {
          moveVec.add(direction);
          const right = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
          moveVec.add(right);
        }
        if (steerDir === "forward") {
          moveVec.add(direction);
        }
        if (steerDir === "backward") {
          moveVec.sub(direction);
        }
      }
    }
    
    // --- Determine if Character is Moving ---
    const currentIsMoving = moveVec.lengthSq() > 0.01;
    if(!isCapturing){
      setIsMoving(currentIsMoving);
    }
    
    
    stepFrameCounter.current++; // Increment counter every frame
    checkGrounded(moveVec);

    if (stepFrameCounter.current % 2 === 0) {
      //takeFirstPersonScreenshotFast();
      if (isAI){
        takeDepthMapFast();
      }
      if (isCapturing){
        takeFirstPersonScreenshotFast();
      }
    }
    
    if (currentIsMoving || isCapturing) {
      // 🔄 Rotate the character toward movement direction
      if(!isCapturing){
        const angle = Math.atan2(moveVec.x, moveVec.z);
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, angle, 0)
        );
        rigidbody.current.setRotation(q, true);
      }
      else {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, s.bh, 0)
        );
        rigidbody.current.setRotation(q, true);
      }
        
      

      // === OPTIMIZED STEP SNAP LOGIC ===
      
      if (stepFrameCounter.current % STEP_UPDATE_INTERVAL === 0) {
        const pos = rigidbody.current.translation();
        const forwardOffset = 0.5; // How far ahead to raycast for steps

        // Update ray origin and direction for the forward ray
        // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
        forwardRayOrigin.current = new rapier.Vector3(
          pos.x + moveVec.x * forwardOffset,
          pos.y + 0.04, // Slightly above ground
          pos.z + moveVec.z * forwardOffset
        );
        // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
        forwardRayDir.current = new rapier.Vector3(moveVec.x, 0, moveVec.z); // Normalized movement direction
        const forwardRay = new rapier.Ray(
          forwardRayOrigin.current,
          forwardRayDir.current
        );

        // Optional: Debug draw forward ray
        if (DEBUG_STEP_RAYS) {
          const start = new THREE.Vector3(
            forwardRayOrigin.current.x,
            forwardRayOrigin.current.y,
            forwardRayOrigin.current.z
          );
          const end = new THREE.Vector3(
            forwardRayOrigin.current.x +
              forwardRayDir.current.x * SNAP_STEP_DISTANCE,
            forwardRayOrigin.current.y +
              forwardRayDir.current.y * SNAP_STEP_DISTANCE,
            forwardRayOrigin.current.z +
              forwardRayDir.current.z * SNAP_STEP_DISTANCE
          );
          const geometry = new THREE.BufferGeometry().setFromPoints([
            start,
            end,
          ]);
          const material = new THREE.LineBasicMaterial({ color: 0xff00ff });
          const debugLine = new THREE.Line(geometry, material);
          scene.add(debugLine);
          setTimeout(() => scene.remove(debugLine), 100);
        }

        const hit = world.castRay(forwardRay, SNAP_STEP_DISTANCE, true);

        if (hit && hit.timeOfImpact < SNAP_STEP_DISTANCE) {
          const stepPoint = forwardRay.pointAt(hit.timeOfImpact);
          //console.log("Stepping Up");
          // Update ray origin for the upper ray
          // CORRECTED: Assign a new rapier.Vector3 instead of using .set()
          upperRayOrigin.current = new rapier.Vector3(
            stepPoint.x,
            stepPoint.y + SNAP_STEP_HEIGHT,
            stepPoint.z
          );
          const upperRay = new rapier.Ray(
            upperRayOrigin.current,
            downwardRayDir.current
          ); // Raycast downwards from above step

          // Optional: Debug draw upper ray
          if (DEBUG_STEP_RAYS) {
            const upStart = new THREE.Vector3(
              upperRayOrigin.current.x,
              upperRayOrigin.current.y,
              upperRayOrigin.current.z
            );
            const upEnd = new THREE.Vector3(
              upperRayOrigin.current.x +
                downwardRayDir.current.x * SNAP_STEP_HEIGHT,
              upperRayOrigin.current.y +
                downwardRayDir.current.y * SNAP_STEP_HEIGHT,
              upperRayOrigin.current.z +
                downwardRayDir.current.z * SNAP_STEP_HEIGHT
            );
            const upGeom = new THREE.BufferGeometry().setFromPoints([
              upStart,
              upEnd,
            ]);
            const upLine = new THREE.Line(
              upGeom,
              new THREE.LineBasicMaterial({ color: 0x00ffff })
            );
            scene.add(upLine);
            setTimeout(() => scene.remove(upLine), 100);
          }

          const upperHit = world.castRay(upperRay, SNAP_STEP_HEIGHT, true); // Cast downwards
          
          // If no obstacle directly above the step, or it's low enough to step over
          if (!upperHit) {
            const pos = rigidbody.current.translation();
            // No collision directly above the step height
            // ✅ Snap up to the step point's Y plus a tiny buffer
            rigidbody.current.setTranslation(
              {
                x: pos.x, // Keep XZ movement continuous through physics
                y: stepPoint.y + 0.05, // Snap to step height + buffer
                z: pos.z,
              },
              true
            );
            console.log("Stepping Up");
          }
        }
      }

      // Instead of applying impulse, set the linear velocity directly.
      // This provides more stable movement that doesn't fight gravity.
      rigidbody.current.setLinvel(
        {
          x: moveVec.x * currentSpeed,
          y: velocity.y, // Preserve the current vertical velocity
          z: moveVec.z * currentSpeed,
        },
        true
      );

    } else {
      // If not moving, set horizontal velocity to zero, but keep vertical velocity.
      rigidbody.current.setLinvel(
        {
          x: 0,
          y: velocity.y,
          z: 0,
        },
        true
      );
    }

  }
    // Screenshot logic - only runs once per 'p' press
    if (!isPianoOpen() && !getGlobalIsChatting()) {
      
      if (keys.current["p"]) {
      takeFirstPersonScreenshot();
      keys.current["p"] = false;
      }
      if (keys.current["l"]){
        takeDepthMap();
        keys.current["l"] = false;
      }
      if (keys.current["j"]){
        setCapturing(!isCapturing);
        //takeDepthMap();
        //takeFirstPersonScreenshotFast();
        if (isCapturing) {
          s.state = 'FORWARD';
        }
        keys.current["j"] = false;
      }
      if (keys.current["k"]){
        setAI(!isAI);
        keys.current["k"] = false;
      }

      }
  });
  

  

  // Determine collider height and offset based on crouching state
  const capsuleHeight = isCrouching
    ? CROUCH_CAPSULE_HEIGHT
    : STAND_CAPSULE_HEIGHT;
  const capsuleRadius = isCrouching
    ? CROUCH_CAPSULE_RADIUS
    : STAND_CAPSULE_RADIUS;
  // Position the capsule so its base is at y=0, and its center is at half its height
  const capsuleOffset = capsuleHeight / 2 + capsuleRadius;

  // Adjust position when changing from stand to crouch and vice-versa
  useEffect(() => {
    if (!rigidbody.current) return;
    const currentTranslation = rigidbody.current.translation();
    // Calculate new Y position to smoothly transition collider
    const newY = isCrouching
      ? currentTranslation.y -
        (STAND_CAPSULE_HEIGHT - CROUCH_CAPSULE_HEIGHT) / 2
      : currentTranslation.y +
        (STAND_CAPSULE_HEIGHT - CROUCH_CAPSULE_HEIGHT) / 2;

    rigidbody.current.setTranslation(
      { x: currentTranslation.x, y: newY, z: currentTranslation.z },
      true
    );
  }, [isCrouching]); // Re-run effect when isCrouching changes


  const mouseDownTime = useRef(null);

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (!isLocalPlayer || !isAiming) return;
      if (e.button !== 0) return; // left click only
      mouseDownTime.current = Date.now(); // record when button was pressed

      setIsBowCharging(true); // start charging
      
      setTimeout(() => {
        setIsBowCharging(false); // charging animation done / initial flag off
        if(!isBowCharged)setIsBowCharged(true);     // now considered fully charged
      }, 600); // 0.5 seconds delay
    };

    const handleMouseUp = (e) => {
      setIsBowCharging(false);
      setIsBowCharged(false);
      if (!isLocalPlayer || !isAiming) return;
      if (e.button !== 0) return; // left click only
      
      if (!mouseDownTime.current) return;
      const heldDuration = Date.now() - mouseDownTime.current;
      console.log(heldDuration);
      if (heldDuration >= 800) {
        console.log("Firing");
        // --- Compute forward vector from yaw/pitch (for aiming) ---
        const cameraForward = new THREE.Vector3(
          Math.sin(yaw.current) * Math.cos(pitch.current),
          Math.sin(pitch.current),
          Math.cos(yaw.current) * Math.cos(pitch.current)
        ).normalize();
        setIsBowCharging(false);
        setIsBowCharged(false);
        
        // --- Right vector (perpendicular to forward and up) ---
        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();

        // --- Projectile direction ---
        const projectileDirection = cameraForward.clone();

        // --- Spawn position: beside the player ---
        const projectileStart = new THREE.Vector3()
          .copy(rigidbody.current.translation())
          .addScaledVector(cameraRight, 0.25)
          .add(new THREE.Vector3(0, -50 + 1, 0)); // height offset

        // --- Fire projectile ---
        if (onFire) onFire(projectileStart, projectileDirection);
      }

      mouseDownTime.current = null; // reset
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isLocalPlayer, isAiming, rigidbody]);
  const [avatarReady, setAvatarReady] = useState(false);
  const [url, setUrl] = useState(null);
  
  useEffect(() => {
    const modelUrl = getAvatarUrlSync(avatar);
    setUrl(modelUrl);
  
    if (!modelUrl) {
      preloadAvatar(avatar).then(() => {
        const newUrl = getAvatarUrlSync(avatar);
        setUrl(newUrl);
        setAvatarReady(true);
      });
    } else {
      setAvatarReady(true);
    }
  }, [avatar]);
  
  if (!avatarReady) return null; // actually waits
    // 2. Load the second GLB (the prop) and rename the destructured variable to avoid conflict
  return (
    <RigidBody
      ref={rigidbody}
      colliders={false}
      type="dynamic"
      friction={0.2}
      linearDamping={0.1}
      angularDamping={0.1}
      lockRotations
      {...props}
    >
      <group ref={group}>
        {/* Pass isSprinting and isCrouching to VRMAvatar for animation */}
        <VRMAvatar
          avatar={url}
          isMoving={isMoving}
          isSprinting={isSprinting}
          isCrouching={isCrouching}
          isAiming={isAiming}
          isGrounded={isGrounded}
          isJumping={isJumping}
          isBowCharging={isBowCharging}
          isBowCharged={isBowCharged}
          isHoldingGun={isHoldingGun}
          pitch={pitch}
          rigidbody={rigidbody}
        />
      </group>
      

      {isAI && (
          <Billboard position={[0, 2, 0]} follow>
            <Text
              fontSize={0.1}
              color="white"
              anchorX="center"
              anchorY="bottom"
              outlineColor="black"
              outlineWidth={0.03}
            >
              {`AI Mode: ${steerDir}`}
            </Text>
          </Billboard>
      )}

      {(isAI || isCapturing) && (
        <Html fullscreen style={{ pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '5px',
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid #00ff00',
            borderRadius: '4px',
            zIndex: 9999 // Force to the very front
          }}>
            <img 
              ref={imgRef} // <--- THIS IS THE KEY
              src={monitorImage.current} 
              alt="AI Monitor"
              style={{ width: '300px', height: 'auto', display: 'block' }} 
            />
            <div style={{ 
              color: '#00ff00', 
              fontSize: '10px', 
              fontFamily: 'monospace', 
              marginTop: '3px' 
            }}>
              SYSTEM_SCAN_ACTIVE
            </div>
          </div>
        </Html>
      )}

      {/* Collider dimensions should match VRMAvatar scale and adjust with crouching */}
      <CapsuleCollider args={[0.75, 0.3]} position={[0, 0.75, 0]} />
    </RigidBody>
  );
});