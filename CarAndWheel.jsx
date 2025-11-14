import React, { useRef, useState, useEffect } from 'react';

import {useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody, useRapier, useRevoluteJoint } from '@react-three/rapier';
import { useGLTF, Billboard, Text } from '@react-three/drei';




/* ---------------- CAR ---------------- */
export function Car({ ref, keys, cameraControls }) {

  const CarMode = {
    STARTUP: "startup",
    IDLING: "idling",
    ACCELERATING: "accelerating",
    DECELERATING: "decelerating",
    MAX_SPEED: "max_speed",
    BRAKING: "braking",
  };
  
   // Audio refs
  const idleAudio = useRef(new Audio("/models/audios/Idling.mp3"));
  const accelAudio = useRef(new Audio("/models/audios/Accelerating.mp3"));
  const maxAudio = useRef(new Audio("/models/audios/Holding.mp3"));
  const decelAudio = useRef(new Audio("/models/audios/Decelerating.mp3"));

  idleAudio.current.loop = true;
  accelAudio.current.loop = true;
  maxAudio.current.loop = true;
  const ghostRef = useRef();

  const carRef = ref;
  const { scene } = useGLTF('/models/mclaren_600lt.glb'); // your GLB
  const frontLeftWheelRef = useRef();
  const frontRightWheelRef = useRef();
  const rearLeftWheelRef = useRef();
  const rearRightWheelRef = useRef();
  const { world, rapier } = useRapier();
  const [currentAccelerationMagnitude, setCurrentAccelerationMagnitude] = useState(0);
  const [steerDir, setSteer] = useState("stop");
  const [isAI, setAI] = useState(false);

  const maxAccelerationForce = 2;
  const accelerationRate = 0.004;
  const turnSpeed = 200;
  const maxSpeed = 5;
  const steerSpeed = 0.05;
  const maxSteer = Math.PI / 6;
  const wheelbase = 4.0;
  const trackWidth = 3.5;
  let speed = 0;

  // Wheel offsets relative to car center
  const FL_OFFSET = new THREE.Vector3(-1.7, -0.2 - 50, -2);
  const FR_OFFSET = new THREE.Vector3(1.7, -0.2 - 50, -2);
  const RL_OFFSET = new THREE.Vector3(-1.7, -0.2 -50, 2);
  const RR_OFFSET = new THREE.Vector3(1.7, -0.2 -50, 2);

  const steeringAngle = useRef(0);
  const cameraTarget = useRef(new THREE.Vector3());

  const [showModel, setShowModel] = useState(false)
  const [carMode, setCarMode] = useState(CarMode.STARTUP);

  const stopAllAudio = () => {
    [idleAudio, accelAudio, maxAudio, decelAudio].forEach(ref => {
      ref.current.pause();
      ref.current.currentTime = 0;
    });
  };

useEffect(() => {
  stopAllAudio();

  if (carMode === CarMode.IDLING) {
      idleAudio.current.play();
    } else if (carMode === CarMode.ACCELERATING) {
        // Sync audio timestamp based on speed
        // Clamp to 0..1
        const ratio = Math.min(Math.max(speed / maxSpeed, 0), 1);
        // Set playback time proportionally
        accelAudio.current.currentTime = accelAudio.current.duration * ratio;
      
      accelAudio.current.play();
    } else if (carMode === CarMode.MAX_SPEED) {
      maxAudio.current.play();
    } else if (carMode === CarMode.DECELERATING) {
      decelAudio.current.play();
    } else {
      idleAudio.current.play();
    }
  }, [carMode]);
  useEffect(() => {
    // Simulate waiting for physics or another trigger
    const timeout = setTimeout(() => {
      setShowModel(true)
    }, 1000) // spawn after 1 second

    return () => clearTimeout(timeout)
  }, [])

  // Brighten only the meshes inside the GLTF
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone()

        // Keep original color and texture
        // Brighten the whole material gently
        child.material.color.multiplyScalar(1)

        // Add subtle emissive brightness but not pure white
        const baseColor = child.material.color.clone().multiplyScalar(0.5)
        child.material.emissive = baseColor
        child.material.emissiveIntensity = 0.1


        child.material.needsUpdate = true
      }
    })
  }, [scene])
  // Screenshot functions (unchanged from your original code)
  
  const firstPersonCamera = useRef(
    new THREE.PerspectiveCamera(
      160,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
  );
  
  const { gl, scene: mainScene } = useThree();
const takeDepthMapFast = () => {
    // --- Configure camera ---
    if (!carRef.current) return;
    firstPersonCamera.current.fov = 80; // your desired FOV
    firstPersonCamera.current.updateProjectionMatrix();

    const width = 800, height = 600;
    const position = carRef.current.translation();
    const rotation = carRef.current.rotation();

    const baseEye = new THREE.Vector3(
      position.x,
      position.y + 5,
      position.z
    );
    // Use car’s full rotation (pitch, yaw, roll)
    firstPersonCamera.current.quaternion.copy(rotation);

    // Move camera forward relative to car rotation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    const eye = baseEye.clone().add(forward.multiplyScalar(2));
    
    firstPersonCamera.current.position.copy(eye);

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
    gl.render(mainScene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    // --- Calculate View and Projection Matrices for Shader Use ---
    const inverseProjectionMatrix = firstPersonCamera.current.projectionMatrix.clone().invert();
    const inverseViewMatrix = firstPersonCamera.current.matrixWorld.clone(); 

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

    /*
    // --- DISPLAY SEGMENTED MAP IN NEW TAB (using the canvas data) ---
    const dataUrl = canvas.toDataURL("image/png");
    const newTab = window.open();
    newTab.document.write(`
      <html>
        <head>
          <style>
            html, body { margin:0; padding:0; overflow:hidden; background:black; }
            img { display:block; width:100vw; height:100vh; object-fit:contain; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" />
        </body>
      </html>
    `);
    newTab.document.close();
    */
    // ----------------------------------------------------------------------
    // **STEEERING LOGIC (Non-Visual)**
    // ----------------------------------------------------------------------

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

const colormapJet = (t) => {
  t = Math.min(Math.max(t, 0), 1);
  const r = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 3.0), 0), 1);
  const g = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 2.0), 0), 1);
  const b = Math.min(Math.max(1.5 - Math.abs(4.0 * t - 1.0), 0), 1);
  return [r * 255, g * 255, b * 255];
};
const takeDepthMap = () => {
  if (!carRef.current) return;
    // Update FOV before rendering
    firstPersonCamera.current.fov = 80; // your desired FOV
    firstPersonCamera.current.updateProjectionMatrix();

    const width = 800, height = 600;
    const position = carRef.current.translation();
    const rotation = carRef.current.rotation();

    const baseEye = new THREE.Vector3(
      position.x,
      position.y + 3,
      position.z
    );
    // Use car’s full rotation (pitch, yaw, roll)
    firstPersonCamera.current.quaternion.copy(rotation);

    // Move camera forward relative to car rotation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    const eye = baseEye.clone().add(forward.multiplyScalar(2));
    
    firstPersonCamera.current.position.copy(eye);
    //firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    
  
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
  gl.render(mainScene, firstPersonCamera.current);
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
let p1 = { x: width * 1 / 8, y: height - 1 };
let p2 = { x: (width * 7) / 8, y: height - 1 };

function interpolate(p1, p2, t) {
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

let topFrac = 0.35;
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
  const takeFirstPersonScreenshot = () => {
    if (!carRef.current) return;
    // Update FOV before rendering
    firstPersonCamera.current.fov = 80; // your desired FOV
    firstPersonCamera.current.updateProjectionMatrix();

    const position = carRef.current.translation();
    const rotation = carRef.current.rotation();

    const baseEye = new THREE.Vector3(
      position.x,
      position.y + 3,
      position.z
    );
    // Use car’s full rotation (pitch, yaw, roll)
    firstPersonCamera.current.quaternion.copy(rotation);

    // Move camera forward relative to car rotation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    const eye = baseEye.clone().add(forward.multiplyScalar(0.05));
    
    firstPersonCamera.current.position.copy(eye);
    //firstPersonCamera.current.lookAt(baseEye.clone().add(direction));

    const renderTarget = new THREE.WebGLRenderTarget(800, 600);
    gl.setRenderTarget(renderTarget);
    gl.render(mainScene, firstPersonCamera.current);
    gl.setRenderTarget(null);

    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 800, 600, pixels);

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(800, 600);

    const brightnessFactor = 1.2;
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
  const stepFrameCounter = useRef(0);
  useFrame((state, delta) => {
    const car = carRef.current;
    if (!car) return;

    let accInput = keys.current['w'] ? 1 : keys.current['s'] ? -1 : 0;
    let steerInput = keys.current['a'] ? 1 : keys.current['d'] ? -1 : 0;
    let braking = keys.current['e'] ? 1 : 0;
    
    stepFrameCounter.current++; // Increment counter every frame
    if (stepFrameCounter.current % 5 === 0) {
      //takeFirstPersonScreenshotFast();
      if (isAI){
        takeDepthMapFast();
      }

    }
    if(isAI){
      steerInput = steerDir == "right" ? -1 : steerDir == "left" ? 1 : 0;
      accInput = steerDir == "forward" ? 1 : steerDir == "backward" ? -1 : Math.abs(steerInput) == 1 ? 1 : 0;
    }
    

    if (keys.current["m"]) {
      takeFirstPersonScreenshot();
      keys.current["m"] = false;
    }
    if (keys.current["n"]){
      takeDepthMap();
      keys.current["n"] = false;
    }
    if (keys.current["b"]){
      setAI(!isAI);
      keys.current["b"] = false;
    }
    // Acceleration smooth increase/decrease
    if (accInput !== 0) {
      setCurrentAccelerationMagnitude(prev => Math.min(maxAccelerationForce, prev + accelerationRate));
    } else {
      setCurrentAccelerationMagnitude(prev => Math.max(0, prev - accelerationRate * 2));
    }

    // Compute effective acceleration
    const effectiveAcceleration = accInput * currentAccelerationMagnitude;



    const pos = car.translation();
    const rot = car.rotation();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rot);
    const vel = car.linvel();
    const currentVel = new THREE.Vector3(vel.x, vel.y, vel.z);
    speed = currentVel.dot(forward);

    // --- Mode logic ---
    if (carMode === CarMode.STARTUP) {
      // handled by useEffect
    }

    if (braking) {
      setCarMode(CarMode.BRAKING);
    } else if (accInput !== 0 && Math.abs(speed) < maxSpeed - 2 && Math.abs(speed) > 2) {
      setCarMode(CarMode.ACCELERATING);
    } else if (Math.abs(speed) >= maxSpeed - 2) {
      setCarMode(CarMode.MAX_SPEED);
    } else if (accInput === 0) {
      if (Math.abs(speed) >= 0 && Math.abs(speed) <= 0.5) {
        setCarMode(CarMode.IDLING);
      }
      else {
        setCarMode(CarMode.DECELERATING);
      }
    }

    //console.log(carMode);

    
    // Apply acceleration
    if (effectiveAcceleration !== 0) {
          // Update speed along forward
      let newSpeed = speed + (effectiveAcceleration * 100) * delta;

      // Prevent flipping direction in one frame
      if (speed > 0 && newSpeed < 0) newSpeed = 0;
      if (speed < 0 && newSpeed > 0) newSpeed = 0;
      //console.log(newSpeed, speed, effectiveAcceleration, delta);
      newSpeed = Math.max(-maxSpeed, Math.min(maxSpeed, newSpeed));
      const newVel = forward.clone().multiplyScalar(newSpeed);
      car.setLinvel({ x: newVel.x, y: vel.y, z: newVel.z }, true);
    }

    // Braking
    if (braking) {
      const reduced = currentVel.clone().multiplyScalar(0.7);
      car.setLinvel({ x: reduced.x, y: vel.y, z: reduced.z }, true);
    }
    //console.log(speed);

    //console.log(steerInput);
    // Steering angular velocity
    if (steerInput !== 0) {
      if(speed != 0){
        const torque = steerInput * turnSpeed * 0.0025 * (Math.sign(accInput) || 1);
        car.setAngvel({ x: 0, y: torque, z: 0 }, true);
      }
    } else {
      const ang = car.angvel();
      car.setAngvel({ x: ang.x * 0.9, y: ang.y * 0.9, z: ang.z * 0.9 }, true);
    }

    // Steering wheel angle
    let newSteer = steeringAngle.current;
    if (steerInput !== 0 && Math.abs(speed) > 0.5) {
      newSteer += steerInput * steerSpeed;
    } else {
      newSteer *= 0.9;
      if (Math.abs(newSteer) < 0.01) newSteer = 0;
    }
    newSteer = Math.max(-maxSteer, Math.min(maxSteer, newSteer));
    steeringAngle.current = newSteer;

    // Ackermann steering math
    let leftSteer = 0;
    let rightSteer = 0;
    if (newSteer !== 0) {
      const turnRadius = wheelbase / Math.tan(Math.abs(newSteer));
      if (newSteer > 0) {
        leftSteer = Math.atan(wheelbase / (turnRadius - trackWidth / 2));
        rightSteer = Math.atan(wheelbase / (turnRadius + trackWidth / 2));
      } else {
        leftSteer = -Math.atan(wheelbase / (turnRadius + trackWidth / 2));
        rightSteer = -Math.atan(wheelbase / (turnRadius - trackWidth / 2));
      }
    }

    // --- Update wheel positions and rotations ---
    const carQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const carPos = new THREE.Vector3(pos.x, pos.y, pos.z);

    const updateWheel = (ref, offset, steer = 0) => {
      if (!ref.current) return;
      const posOffset = offset.clone().applyQuaternion(carQuat);
      ref.current.position.set(carPos.x + posOffset.x, carPos.y + posOffset.y, carPos.z + posOffset.z);

      const baseRot = carQuat.clone();
      const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), speed * 0.05);
      const initialRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      baseRot.multiply(steerQuat).multiply(spinQuat).multiply(initialRot);
      ref.current.setRotationFromQuaternion(baseRot);
    };

   const updateGhost = (ref) => {
    if (!ref.current) return;

    const carPos = carRef.current.translation();
    const carQuat = carRef.current.rotation();

    const offset = new THREE.Vector3(0, 0, -6).applyQuaternion(carQuat);

    ref.current.setNextKinematicTranslation({
      x: carPos.x + offset.x,
      y: carPos.y + offset.y,
      z: carPos.z + offset.z,
    });

    ref.current.setNextKinematicRotation(carQuat);
  };
    if (ghostRef.current) {
      updateGhost(ghostRef);
    }
    
  
    //updateWheel(frontLeftWheelRef, FL_OFFSET, leftSteer);
    //updateWheel(frontRightWheelRef, FR_OFFSET, rightSteer);
    //updateWheel(rearLeftWheelRef, RL_OFFSET);
    //updateWheel(rearRightWheelRef, RR_OFFSET);

    /*
    // --- Smooth camera follow ---
    const camCtrl = cameraControls.current;
    if (camCtrl) {
    // Desired camera position offset behind & above car
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(carQuat);
    const desiredCamPos = carPos.clone()
        .add(forward.clone().multiplyScalar(-8)) // behind car
        .add(new THREE.Vector3(0, 4, 0)); // above car

    // Smooth camera motion
    camCtrl.camera.position.lerp(desiredCamPos, 0.5); // lower = smoother

    // Smooth camera target
    cameraTarget.current.lerp(carPos, 0.5);
    camCtrl.setLookAt(
        camCtrl.camera.position.x,
        camCtrl.camera.position.y,
        camCtrl.camera.position.z,
        cameraTarget.current.x,
        cameraTarget.current.y,
        cameraTarget.current.z,
        false // don't need to transition
    );
    }
    */
  });
  
  return (
    <>
      <RigidBody
      ref={carRef}
      colliders="cuboid"
      mass={100}
      position={[0, 1, 0]}
      linearDamping={0.1}
      angularDamping={0}
      >
        {/* Show GLB only after physics ready */}
      {showModel && (
        <primitive
          object={scene}
          scale={150 * 1.5}
          position={[0, -0.5, 0]}
          rotation={[0, Math.PI, 0]}
        />
      )}
        {/* Invisible collider mesh */}
        <mesh visible={true}>
          <boxGeometry args={[4, 1, 9]} />
          <meshStandardMaterial
            color="#e74c3c"
            transparent={true}
            opacity={0}     // 0 = fully transparent, 1 = opaque
          />
        </mesh>

        {isAI && (
          <Billboard position={[0, 4, 0]} follow>
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
      </RigidBody>

      {/* <Ghost ref={ghostRef} /> */}


      
      {/* Wheels */}
    </>
  );
}


const Ghost = React.forwardRef((props, ref) => {
  return (
    <RigidBody
      ref={ref}                 // ✅ forward the parent's ref here
      colliders={false}         // ✅ correct prop to disable collisions
      type="kinematicPosition"  // ✅ recommended for controlled motion
      position={[0, 1, 0]}
      linearDamping={0.5}
      angularDamping={0.5}
      {...props}                // ✅ allow overrides like color or position
    >
      <mesh visible>
        <boxGeometry args={[6, 1, 9]} position={[0,0.2,0]}/>
        <meshStandardMaterial
          color="yellow"
          transparent
          opacity={0.4}
        />
      </mesh>

      <mesh visible rotation={[0, Math.PI / (360/90), 0]} position={[-3,0,-4]}>
        <boxGeometry args={[6, 1, 9]} />
        <meshStandardMaterial
          color="orange"
          transparent
          opacity={0.4}
        />
      </mesh>

      <mesh visible rotation={[0, -Math.PI / (360/90), 0]} position={[3,0,-4]}>
        <boxGeometry args={[6, 1, 9]} />
        <meshStandardMaterial
          color="orange"
          transparent
          opacity={0.4}
        />
      </mesh>
    </RigidBody>
  );
});

const WheelWithJoint = React.forwardRef(({ carRef, position, axis = [1, 0, 0] }, ref) => {
  const wheelRef = useRef();

  // Attach wheel to car with revolute joint (allows spinning)
  useRevoluteJoint(carRef, wheelRef, [
    position, // car anchor
    [0, 0, 0], // wheel anchor (its local center)
    axis,      // rotation axis
  ]);


  return (
    <RigidBody
      ref={wheelRef}
      collider={false} // 🔹 no collider, purely visual
      mass={1}
      position={position}
      linearDamping={0.5}
      angularDamping={0.5}
      type="dynamic"
    >
      <mesh ref={ref} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 0.5, 32]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
    </RigidBody>
  );
});