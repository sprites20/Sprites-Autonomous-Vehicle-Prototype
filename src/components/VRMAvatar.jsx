import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Face, Hand, Pose } from "kalidokit";
import { useControls } from "leva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // Added useState import
import { Euler, Object3D, Quaternion, Vector3, Matrix4 } from "three";
import { lerp } from "three/src/math/MathUtils.js";
import { useVideoRecognition } from "../hooks/useVideoRecognition";
import { remapMixamoAnimationToVrm } from "../utils/remapMixamoAnimationToVrm";
import { remapUE5AnimationToVrm } from "../utils/remapUE5AnimationToVrm";
import { remapBVHAnimationToVRM } from "../utils/remapBVHAnimationToVrm";
import * as THREE from 'three'; // Make sure THREE is imported
import { targetPosition } from './TargetPosition'; // import the shared ref
import { openDB } from "idb"; // lightweight IndexedDB wrapper
import { visemeWeightsRef } from "./lipsyncrefs";
import { setGlobalUserData } from './Globals';
import { loadFBXWithCache } from "./fbx-cache-loader";
import {FlameEmitter} from "./FlameEmitter";

const tmpVec3 = new Vector3();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpMatrix = new Matrix4();

// helper hook to force re-render
function useForceUpdate() {
  const [, setTick] = useState(0);
  return () => setTick((t) => t + 1);
}
// --- A Simple Cache/Suspense Implementation for Assets (Not part of the hook) ---
// In a real app, this would be in a separate module.
const fbxCache = new Map();

function readFBX(path) {
  let asset = fbxCache.get(path);

  if (asset === undefined) {
    // 1. Create a promise and store it in the cache
    const promise = loadFBXWithCache(path)
      .then((blobUrl) => {
        // Resolve the stored asset state
        fbxCache.set(path, { status: 'resolved', data: blobUrl });
      })
      .catch((error) => {
        // Reject the stored asset state
        fbxCache.set(path, { status: 'rejected', data: error });
      });
    
    // Store the loading state
    asset = { status: 'pending', data: promise };
    fbxCache.set(path, asset);
  }

  // 2. Check the status and throw/return accordingly
  switch (asset.status) {
    case 'pending':
      // This throws the Promise, triggering React Suspense
      throw asset.data;
    case 'rejected':
      // This throws the Error, triggering a React Error Boundary
      throw asset.data;
    case 'resolved':
      // Asset is ready, return the data (the URL)
      return asset.data;
    default:
      // Should not happen
      return null; 
  }
}

// --- The Custom Hook ---
/**
 * Loads an FBX asset using a cache, suspending until the URL is ready,
 * and then calls useFBX(url).
 * * @param {string} path - The path to the FBX file.
 * @returns The result of useFBX(url).
 */
export function useCachedFBX(path) {
  // 1. Read the asset from the cache.
  // This will throw a Promise and suspend the component if loading,
  // or throw an Error if loading failed.
  // It will ONLY proceed past this line if the asset is ready.
  const url = readFBX(path);
  
  // console.log("URL is ready:", url); // This only logs when URL is not null

  // 2. Once the URL is ready, use the final hook synchronously.
  // Since the component suspended until 'url' was available, this call is safe.
  return useFBX(url);
}


export const VRMAvatar = ({ 
	avatar,
	isMoving,
	isSprinting,
	isCrouching,
	isAiming,
	isGrounded,
	isJumping,
  isBowCharging,
  isBowCharged,
  isHoldingGun,
  pitch,
	rigidbody,
	...props 
}) => {
  const [talkingTimestamp, setTalkingTimestamp] = useState(0);
  const isTalking = true;
  const [startTime, setStartTime] = useState(0);
  const accumulatedDeltaRef = useRef(0); // Use useRef to persist accumulatedDelta
  const scriptIndexRef = useRef(0);
  const maxTimeRef = useRef(0);  // persists between renders
  
  const modelUrl = avatar;
  const { scene, userData } = useGLTF(
    avatar,
    undefined,
    undefined,
    (loader) => loader.register((parser) => new VRMLoaderPlugin(parser)),
    { clone: true }
  );

  useEffect(() => {
    setGlobalUserData(userData);
  }, [userData]);


const talkingScript = [
  { time: 0.2, blendShape: "ih", value: 0.6 }, // Heh (ih)
  { time: 0.4, blendShape: "ee", value: 0 },
  { time: 1, blendShape: "ih", value: 0.4 }, // Start of L (ee-like)
  { time: 0.7, blendShape: "ee", value: 0 },
  { time: 1, blendShape: "ou", value: 0.7 }, // Loh (oh)
  // ... more entries to simulate words
  ];
  const currentScriptItemRef = useRef(talkingScript[0]);

  //console.log("modelUrl", modelUrl);

  const currentVrm = userData.vrm;
  useEffect(() => {
  const vrm = userData?.vrm
  if (!vrm) return

  const mats = []
  const meshes = []

  const processMaterial = (m, meshName) => {
    if (!mats.some(item => item.material === m)) {
      mats.push({
        meshName: meshName,
        material: m,
        materialName: m.name || meshName,
        map: m.map || null,
        originalMap: m.map || null,
      })
    }
  }

  vrm.scene.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      // Collect mesh info
      meshes.push({
        name: obj.name || 'Unnamed Mesh',
        object: obj,
        initialVisible: obj.visible,
      })

      // Collect materials
      const materialsToProcess = Array.isArray(obj.material) ? obj.material : [obj.material]
      materialsToProcess.forEach(m => processMaterial(m, obj.name))
    }
  })

  if (vrm.materials) {
    vrm.materials.forEach(m => processMaterial(m, m.name))
  }

  console.log('Collected materials:', mats)
  console.log('Collected meshes:', meshes)

  
}, [userData])




  //console.log("modelURL", modelUrl);
  //console.log("currentVrm", currentVrm);
const assetA = useCachedFBX("models/animations/Swing Dancing.fbx");
const assetB = useCachedFBX("models/animations/Thriller Part 2.fbx");
const assetC = useCachedFBX("models/animations/Breathing Idle.fbx");
const assetD = useCachedFBX("models/animations/Samba Dancing.fbx");

const assetStartWalking = useCachedFBX("models/animations/Female Start Walking.fbx");
const assetWalking = useCachedFBX("models/animations/Walking.fbx");
const assetBallet = useCachedFBX("models/animations/Ballet.fbx");
const assetRunning = useCachedFBX("models/animations/Running.fbx");
const assetFallingIdle = useCachedFBX("models/animations/Falling Idle.fbx");

const assetStartJumping = useCachedFBX("models/animations/Start Jumping.fbx");
const assetSlashInwards = useCachedFBX("models/animations/Stable Sword Inward Slash.fbx");
const assetSlashOutwards = useCachedFBX("models/animations/Stable Sword Outward Slash.fbx");
const assetGreatSwordSlash = useCachedFBX("models/animations/Great Sword Slash.fbx");
const assetBowCharging = useCachedFBX("models/animations/Standing Draw Arrow.fbx");
const assetBowCharged = useCachedFBX("models/animations/Standing Aim Overdraw.fbx");


const animationBowCharged = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetBowCharged);
  return clip;
}, [assetBowCharged, currentVrm]);

  const animationBowCharging = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetBowCharging);
  return clip;
}, [assetBowCharging, currentVrm]);

  const animationGreatSwordSlash = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetGreatSwordSlash);
  return clip;
}, [assetGreatSwordSlash, currentVrm]);

  const animationSlashInwards = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetSlashInwards);
  return clip;
}, [assetSlashInwards, currentVrm]);

const animationSlashOutwards = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetSlashOutwards);
  return clip;
}, [assetSlashOutwards, currentVrm]);


const animationStartJumping = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetStartJumping);
  return clip;
}, [assetStartJumping, currentVrm]);

const animationFallingIdle = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetFallingIdle);
  return clip;
}, [assetFallingIdle, currentVrm]);

const animationRunning = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetRunning);
  return clip;
}, [assetRunning, currentVrm]);

const animationClipA = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetA);
  return clip;
}, [assetA, currentVrm]);

const animationClipB = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetB);
  return clip;
}, [assetB, currentVrm]);

const animationClipC = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetC);
  return clip;
}, [assetC, currentVrm]);

const animationClipD = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetD);
  return clip;
}, [assetD, currentVrm]);

const animationClipStartWalking = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetStartWalking);
  return clip;
}, [assetStartWalking, currentVrm]);

const animationClipWalking = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetWalking);
  return clip;
}, [assetWalking, currentVrm]);

const animationClipBallet = useMemo(() => {
  if (!currentVrm) return null;
  const clip = remapUE5AnimationToVrm(currentVrm, assetBallet);
  return clip;
}, [assetBallet, currentVrm]);

// Assign names safely
if (animationClipA) animationClipA.name = "Swing Dancing";
if (animationClipB) animationClipB.name = "Thriller Part 2";
if (animationClipC) animationClipC.name = "Idle";
if (animationClipD) animationClipD.name = "Samba Dancing";
if (animationClipStartWalking) animationClipStartWalking.name = "Female Start Walking";
if (animationClipWalking) animationClipWalking.name = "Walking";
if (animationClipBallet) animationClipBallet.name = "Ballet";
if (animationRunning) animationRunning.name = "Running";
if (animationFallingIdle) animationFallingIdle.name = "Falling Idle";
if (animationStartJumping) animationStartJumping.name = "Start Jumping";
if (animationSlashInwards) animationSlashInwards.name = "Slash Inwards";
if (animationSlashOutwards) animationSlashOutwards.name = "Slash Outwards";
if (animationGreatSwordSlash) animationGreatSwordSlash.name = "Great Sword Slash";
if (animationBowCharging) animationBowCharging.name = "Bow Charging";
if (animationBowCharged) animationBowCharged.name = "Bow Charged";

// Collect all non-null clips
const clips = [
  animationClipA,
  animationClipB,
  animationClipC,
  animationClipD,
  animationClipStartWalking,
  animationClipWalking,
  animationClipBallet,
  animationRunning,
  animationFallingIdle,
  animationStartJumping,
  animationSlashInwards,
  animationSlashOutwards,
  animationGreatSwordSlash,
  animationBowCharging,
  animationBowCharged
].filter(Boolean);

// Use animations
const { actions } = useAnimations(clips, currentVrm?.scene ?? null);

  const vrm = userData?.vrm;

  useEffect(() => {
    const vrm = userData.vrm;
    console.log("VRM loaded:", vrm);
    // calling these functions greatly improves the performance
    VRMUtils.removeUnnecessaryVertices(scene);
    VRMUtils.combineSkeletons(scene);
    VRMUtils.combineMorphs(vrm);

    // Disable frustum culling
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });
    /*
    vrm.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        // Flip normals
        if (obj.geometry && obj.geometry.attributes.normal) {
          console.log("Fliping normals for:", obj.name);
          const normalAttr = obj.geometry.attributes.normal
          for (let i = 0; i < normalAttr.count; i++) {
            normalAttr.setXYZ(
              i,
              -normalAttr.getX(i),
              -normalAttr.getY(i),
              -normalAttr.getZ(i)
            )
          }
          normalAttr.needsUpdate = true
          obj.geometry.attributes.normal.needsUpdate = true;
          // Force a version bump
          obj.geometry.verticesNeedUpdate = true; 
          obj.geometry.elementsNeedUpdate = true;
        }
      }
    })
    */
  }, [scene]);

 const [meshMap, setMeshMap] = useState({});
const [visibilityControls, setVisibilityControls] = useState({});

useEffect(() => {
  if (!vrm) return;

  const newMeshMap = {};
  const newVisibilityControls = {};

  vrm.scene.traverse((obj) => {
    if (obj.isSkinnedMesh) {
      newMeshMap[obj.name] = obj;
      newVisibilityControls[obj.name] = true; // default to visible
    }
  });

  setMeshMap(newMeshMap);
  setVisibilityControls(newVisibilityControls);
}, [vrm]);

/*
const levaVisibility = useControls('Visibility', () => {
  const controls = {};
  for (const meshName in visibilityControls) {
    controls[meshName] = {
      value: visibilityControls[meshName],
      label: meshName,
      onChange: (val) => {
        if (meshMap[meshName]) {
          meshMap[meshName].visible = val;
        }
      },
    };
  }
  return controls;
}, [meshMap, visibilityControls]);
*/

  const setResultsCallback = useVideoRecognition(
    (state) => state.setResultsCallback
  );
  const videoElement = useVideoRecognition((state) => state.videoElement);
  const riggedFace = useRef();
  const riggedPose = useRef();
  const riggedLeftHand = useRef();
  const riggedRightHand = useRef();

  const resultsCallback = useCallback(
    (results) => {
      if (!videoElement || !currentVrm) {
        return;
      }
      if (results.faceLandmarks) {
        riggedFace.current = Face.solve(results.faceLandmarks, {
          runtime: "mediapipe", // `mediapipe` or `tfjs`
          video: videoElement,
          imageSize: { width: 640, height: 480 },
          smoothBlink: false, // smooth left and right eye blink delays
          blinkSettings: [0.25, 0.75], // adjust upper and lower bound blink sensitivity
        });
      }
      if (results.za && results.poseLandmarks) {
        riggedPose.current = Pose.solve(results.za, results.poseLandmarks, {
          runtime: "mediapipe",
          video: videoElement,
        });
      }

      // Switched left and right (Mirror effect)
      if (results.leftHandLandmarks) {
        riggedRightHand.current = Hand.solve(
          results.leftHandLandmarks,
          "Right"
        );
      }
      if (results.rightHandLandmarks) {
        riggedLeftHand.current = Hand.solve(results.rightHandLandmarks, "Left");
      }
    },
    [videoElement, currentVrm]
  );

  useEffect(() => {
    setResultsCallback(resultsCallback);
  }, [resultsCallback]);
const enableAvatarControls = false;
  //const { avatar } = useControls("VRM", {
  /*
  var {
    aa,
    ih,
    ee,
    oh,
    ou,
    blinkLeft,
    blinkRight,
    angry,
    sad,
    happy,
    animation,
	talking,
  } = useControls("VRM", () => enableAvatarControls ? {
    aa: { value: 0, min: 0, max: 1 },
    ih: { value: 0, min: 0, max: 1 },
    ee: { value: 0, min: 0, max: 1 },
    oh: { value: 0, min: 0, max: 1 },
    ou: { value: 0, min: 0, max: 1 },
    blinkLeft: { value: 0, min: 0, max: 1 },
    blinkRight: { value: 0, min: 0, max: 1 },
    angry: { value: 0, min: 0, max: 1 },
    sad: { value: 0, min: 0, max: 1 },
    happy: { value: 0, min: 0, max: 1 },
    animation: {
          options: ["None", "Idle", "Swing Dancing", "Thriller Part 2", "Samba Dancing", "Female Start Walking", "Walking", "Ballet"],
          value: "Idle",
        },
        talking: {
          options: ["No Talk", "Talking 1", "Poetry"],
          value: "No Talk"
        },
      }
    : {},
  [enableAvatarControls]
);
*/
const aa = 0;
const ih = 0;
const ee = 0;
const oh = 0;
const ou = 0;
const blinkLeft = 0;
const blinkRight = 0;
const angry = 0;
const sad = 0;
const happy = 0;
const animation = "Idle";
const talking = "No Talk";
// Inside your component
const previousValues = useRef({}); // persists across renders
var expressionChanged = false;
var previousTime = 0;


const [audio] = useState(new Audio()); // Audio object for playing sound

const [manualAnimation, setManualAnimation] = useState("Idle");

var currentAnimation = manualAnimation ?? animation;


  useEffect(() => {
	//currentAnimation = animation;
	setManualAnimation(animation);
  }, [animation]);
  // Use effect to trigger audio playback when `talking` control changes
  useEffect(() => {
    if (talking === "Talking 1") {
      audio.src = "models/audios/hello-48300.mp3"; // Replace with your audio file path
      audio.play();
    }
	else if(talking === "Poetry") {
      audio.src = "models/audios/poetry.mp3"; // Replace with your audio file path
      audio.play();
	}
	else {
      // Optionally, stop the audio or play another sound when not talking
      audio.pause();
      audio.currentTime = 0;
    }
  }, [talking]); // Run effect whenever `talking` changes

useEffect(() => {
  const currentValues = { aa, ih, ee, oh, ou, blinkLeft, blinkRight, angry, sad, happy };

  for (const key in currentValues) {
    const prev = previousValues.current[key];
    const curr = currentValues[key];

    if (prev === undefined || Math.abs(prev - curr) > 0.001) {
        expressionChanged = true;
      break;
    }
  }

  // Update stored values for next frame
  previousValues.current = currentValues;

  if (expressionChanged) {
    console.log("Control values changed since last frame");
	  actions[animation].time = maxTimeRef.current;
    console.log("Using maxTimeRef:", maxTimeRef.current);
  }
}, [aa, ih, ee, oh, ou, blinkLeft, blinkRight, angry, sad, happy]);
const keys = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
  });
  
const [manualAnimActive, setManualAnimActive] = useState(false);
let isSlashing = false;
/*
useEffect(() => {
  let clickCount = 0;
  let lastSlash = "Slash Outwards";
  let SLASH_DURATION = 1500;

  const handleClick = (e) => {
    if (e.button !== 0) return;
    if (isSlashing) return;
    
    clickCount++;
    isSlashing = true;
    setManualAnimActive(true);

    const nextSlash = lastSlash === "Slash Inwards" ? "Slash Outwards" : "Slash Inwards";
    lastSlash = nextSlash;
    setManualAnimation(nextSlash);
    
    if (nextSlash === "Slash Inwards" && actions[nextSlash]) {
      // Set current animation time to 
      SLASH_DURATION = 1000;
      actions[nextSlash].time = 0.6;
      maxTimeRef.current = 0.6;

      // Update previousTimes array
      previousTimes.push(1);
      if (previousTimes.length > 10) previousTimes.shift(); // keep last 10
    } else if (actions[nextSlash]) {
      SLASH_DURATION = 1300;
      // For other animations, store their current time
      const currentTime = actions[nextSlash].time || 0;
      previousTimes.push(currentTime);
      if (previousTimes.length > 10) previousTimes.shift();
    }
    
    setTimeout(() => {
      isSlashing = false;
      //setManualAnimation("Idle");
      //setManualAnimActive(false);
    }, SLASH_DURATION);

    setTimeout(() => {
      if(!isSlashing){
        setManualAnimActive(false);
      }
    }, SLASH_DURATION + 200);
  };

  window.addEventListener("mousedown", handleClick);
  return () => window.removeEventListener("mousedown", handleClick);
}, [setManualAnimation]);
*/
const isAimingRef = useRef(isAiming);

// Keep ref in sync
useEffect(() => {
  isAimingRef.current = isAiming;
}, [isAiming]);

useEffect(() => {
  let clickCount = 0;
  let currentSlashIndex = 0;
  const slashSequence = ["Great Sword Slash", "Slash Inwards"];
  let SLASH_DURATION = 1500;

  const handleClick = (e) => {
    if (e.button !== 0) return; // left click only
    if (isSlashing) return; // prevent overlap
    if (isAimingRef.current) return; // use ref instead of state

    clickCount++;
    isSlashing = true;
    setManualAnimActive(true);

    const nextSlash = slashSequence[currentSlashIndex];
    currentSlashIndex = (currentSlashIndex + 1) % slashSequence.length;
    setManualAnimation(nextSlash);

    
    // Custom durations or behavior per attack
    if (nextSlash === "Slash 1" && actions[nextSlash]) {
      SLASH_DURATION = 1000;
      actions[nextSlash].time = 0.3;
      maxTimeRef.current = 0.3;
    } else if (nextSlash === "Slash 2" && actions[nextSlash]) {
      SLASH_DURATION = 1100;
      actions[nextSlash].time = 0.5;
      maxTimeRef.current = 0.5;
    } else if (nextSlash === "Slash 3" && actions[nextSlash]) {
      SLASH_DURATION = 1300;
      actions[nextSlash].time = 0.7;
      maxTimeRef.current = 0.7;
    } else if(
      nextSlash === "Great Sword Slash" && actions[nextSlash]) {
      SLASH_DURATION = 2400;
      actions[nextSlash].time = 0;
      maxTimeRef.current = 0;
    }

    // Optional: track time history
    const currentTime = actions[nextSlash]?.time || 0;
    previousTimes.push(currentTime);
    if (previousTimes.length > 10) previousTimes.shift();

    setTimeout(() => {
      isSlashing = false;
    }, SLASH_DURATION);

    setTimeout(() => {
      if (!isSlashing) setManualAnimActive(false);
    }, SLASH_DURATION + 200);
  };

  window.addEventListener("mousedown", handleClick);
  return () => window.removeEventListener("mousedown", handleClick);
}, [setManualAnimation]);

const [isBowFullyCharged, setIsBowFullyCharged] = useState(false);
useEffect(() => {
  if (isAiming){
    if (isBowCharging) {
      console.log("Bow Charging");
      setManualAnimation("Bow Charging");
      setManualAnimActive(true);
    }
    else if (isBowCharged){
      if(!isBowFullyCharged){
      setManualAnimation("Bow Charged");
      setManualAnimActive(true);
      setTimeout(() => {
        setIsBowFullyCharged(true);
      }, 1500); // default 2 seconds
    }
    else {
      setManualAnimActive(false);
      setIsBowFullyCharged(false);
      setManualAnimation("Idle");
    }
    }
    else {
      setManualAnimActive(false);
      setIsBowFullyCharged(false);
      setManualAnimation("Idle");
    }
  }
  if (manualAnimActive) return; // skip automatic animations if manual is playing
  if (isJumping) {
    setManualAnimation("Start Jumping");
  } else if (isMoving && isGrounded && !isSlashing) {
    setManualAnimation(isSprinting ? "Running" : "Walking");
  } else if (!isGrounded) {
    setManualAnimation("Falling Idle");
  } else {
    setManualAnimation("Idle");
  }

  return () => actions[currentAnimation]?.stop();
}, [isMoving, isJumping, isGrounded, isSprinting, isBowCharging, isBowCharged, isBowFullyCharged, currentAnimation, actions, manualAnimActive]);

useEffect(() => {
  // Handle keydown event to track which keys are pressed
  
  const handleKeyDown = (e) => {
    if (e.key.toLowerCase() === "w" || e.key.toLowerCase() === "a" || e.key.toLowerCase() === "s" || e.key.toLowerCase() === "d") {
      keys.current[e.key.toLowerCase()] = true;
      if(!isSlashing) setManualAnimation("Walking"); // Start walking animation when any of the movement keys are pressed
    }
  };

  // Handle keyup event to check if any of the keys are still pressed
  const handleKeyUp = (e) => {
    if (e.key.toLowerCase() === "w" || e.key.toLowerCase() === "a" || e.key.toLowerCase() === "s" || e.key.toLowerCase() === "d") {
      keys.current[e.key.toLowerCase()] = false;
      
      // If none of the keys are pressed, set animation to Idle
      if (!keys.current.w && !keys.current.a && !keys.current.s && !keys.current.d) {
        if(!isSlashing){
          setManualAnimation("Idle");
        }
      }
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
}, []);

useEffect(() => {
  const triggerIdle = () => {
    setManualAnimation("Idle");
    //window.removeEventListener("visibilitychange", triggerIdle);
  };

  window.addEventListener("visibilitychange", triggerIdle);

  // Cleanup in case it doesn't fire
  //return () => window.removeEventListener("visibilitychange", triggerIdle);
}, []);
useEffect(() => {
  if (currentAnimation === "None" || videoElement) currentAnimation = "Idle";
  actions[currentAnimation]?.play();
  return () => {
    actions[currentAnimation]?.stop();
  };
}, [actions, currentAnimation, videoElement]);

const flameRef = useRef();
/*
const { scene: propScene } = useGLTF('models/untitled.glb');
const { scene: hatScene } = useGLTF('models/top_hat.glb');
const { scene: swordScene } = useGLTF('models/medieval_sword.glb');

const meshToAttach = useMemo(() => {
  const clone = propScene.clone(true);
  clone.scale.set(1.25, 1.25, 1.25); // scale if needed
  return clone;
}, [propScene]);

const hatMesh = useMemo(() => {
  const clone = hatScene.clone(true);
  clone.scale.set(0.01, 0.01, 0.01); // scale if needed
  return clone;
}, [hatScene]);

const swordMesh = useMemo(() => {
  const clone = swordScene.clone(true);
  clone.scale.set(1, 1, 1); // scale if needed
  return clone;
}, [swordScene]);


useEffect(() => {
  if (!userData.vrm) return;

  const hipBone = userData.vrm.humanoid.getNormalizedBoneNode("hips");
  if (!hipBone) {
    console.warn("Could not find hip bone!");
    return;
  }
  
  //hipBone.add(meshToAttach);

  meshToAttach.position.set(0, -0.09, 0); 
  meshToAttach.scale.set(1.25, 1.25, 1.25);
  meshToAttach.rotation.set(Math.PI/16, Math.PI, 0);
  
  const hatBone = userData.vrm.humanoid.getNormalizedBoneNode("head");
  if (!hatBone) {
    console.warn("Could not find hat bone!");
    return;
  }

  //hatBone.add(hatMesh);

  hatMesh.position.set(0, 0.15, 0); 
  hatMesh.scale.set(0.00045, 0.0003, 0.0005);
  hatMesh.rotation.set(0, Math.PI, 0);

  const handBone = userData.vrm.humanoid.getNormalizedBoneNode("rightHand");
  

  /*
  //Spatula
  handBone.add(swordMesh);
  swordMesh.position.set(0.05, 0, 0); 
  swordMesh.scale.set(0.0005, 0.0005, 0.0005);
  swordMesh.rotation.set(0, -Math.PI/2, 0);
  */
  /*
  //handBone.add(swordMesh);
  swordMesh.position.set(0.05, 0, -0.25); 
  swordMesh.scale.set(0.5, 0.5, 0.4);
  swordMesh.rotation.set(0, -Math.PI/2, 0);

  
  // 🔥 Attach flame group to sword
  if (flameRef.current) {
    swordMesh.add(flameRef.current);

    // Optional: adjust flame's local offset on the sword
    flameRef.current.position.set(-0.5, 0, 0); 
    flameRef.current.rotation.set(Math.PI / 2, 0, 0); 
  }
  // Apply the shape key correctly
  meshToAttach.traverse((child) => {
    if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
      const index = child.morphTargetDictionary["Key 1"];
      console.log(child);
      if (index !== undefined) {
        child.morphTargetInfluences[index] = 0; // ✅ correct
        child.needsUpdate = true;
      }
    }
  });
}, [userData.vrm, swordMesh]);
*/
var previousTimes = [];
var is_lerping = false;
  const lerpExpression = (name, value, blendshape, altval, lerpFactor) => {
  const current = userData.vrm.expressionManager.getValue(name);
  

	if (name === blendshape)value = altval;
  const lerped = lerp(current, value, lerpFactor);
  // Only set the new value and update `is_lerping` if there's a noticeable change
  if (Math.abs(lerped - current) > 0.001) {
    userData.vrm.expressionManager.setValue(name, lerped, false);
  }
};
  const boneDebugSpheres = new Map();
  const displayBoneLocation = (boneName) => {
    // Assuming userData.vrm is available in this scope
    const bone = userData.vrm.humanoid.getNormalizedBoneNode(boneName);

    if (!bone) {s
        console.warn(`VRM Bone Debugger: Could not find normalized bone: ${boneName}`);
        return;
    }

    let sphereMesh = boneDebugSpheres.get(boneName);

    if (!sphereMesh) {
        // --- STEP 1: Create the Debug Sphere Mesh ---
        
        const radius = 0.05; 
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        
        // CRITICAL MATERIAL MODIFICATION FOR 'ALWAYS ON TOP'
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, // Changed color for clarity (Cyan)
            wireframe: true, 
            transparent: true, 
            opacity: 0.8,
            depthWrite: false, // Prevents sphere from obscuring other objects
            depthTest: false,  // REQUIRED: Draws sphere regardless of distance, making it always visible
        });
        
        sphereMesh = new THREE.Mesh(geometry, material);
        sphereMesh.name = `DEBUGGER_BONE_LOCAL_${boneName}`;

        // --- STEP 2: Attach to the Bone ---
        // Attach the sphere directly to the bone.
        // The sphere's local position is now relative to the bone's origin (tip/joint).
        bone.add(sphereMesh); 
        
        // Since it's attached, set the sphere's local position to (0,0,0) 
        // to place it at the bone's pivot point.
        sphereMesh.position.set(0, 0, 0); 

        boneDebugSpheres.set(boneName, sphereMesh);
        
        console.log(`✅ Attached 'Always On Top' Debug Sphere to: ${boneName}`);
    }

    // Since the sphere is a child of the bone, it automatically tracks the bone's 
    // position and rotation relative to the VRM model and scene. 
    
    // If you need the bone's world position for a log:
    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);
    
    console.log(`🦴 Sphere Attached to Bone: ${boneName}. Current World Pos: X:${worldPosition.x.toFixed(3)}, Y:${worldPosition.y.toFixed(3)}, Z:${worldPosition.z.toFixed(3)}`);
};

const rotateBoneAxis = (
  boneName,
  axis,            // "x", "y", or "z"
  angle,           // in radians
  slerpFactor = 1, // how fast to blend
  flip = { x: 1, y: 1, z: 1 }
) => {
  const bone = userData.vrm.humanoid.getNormalizedBoneNode(boneName);
  if (!bone) {
    console.warn(`Bone ${boneName} not found`);
    return;
  }

  // Copy current rotation
  tmpEuler.copy(bone.rotation);

  // Apply rotation only on selected axis
  if (axis === "x") tmpEuler.x = angle * flip.x;
  if (axis === "y") tmpEuler.y = angle * flip.y;
  if (axis === "z") tmpEuler.z = angle * flip.z;

  // Convert to quaternion
  tmpQuat.setFromEuler(tmpEuler);

  // Smooth transition
  bone.quaternion.slerp(tmpQuat, slerpFactor);
};

  const rotateBone = (
    boneName,
    value,
    slerpFactor,
    flip = {
      x: 1,
      y: 1,
      z: 1,
    }
  ) => {
    const bone = userData.vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) {
      console.warn(
        `Bone ${boneName} not found in VRM humanoid. Check the bone name.`
      );
      console.log("userData.vrm.humanoid.bones", userData.vrm.humanoid);
      return;
    }

    tmpEuler.set(value.x * flip.x, value.y * flip.y, value.z * flip.z);
    tmpQuat.setFromEuler(tmpEuler);
    bone.quaternion.slerp(tmpQuat, slerpFactor);
  };
  
const leaveTraceAtBone = (boneName, durationMs = 5000) => {
    const bone = userData.vrm.humanoid.getNormalizedBoneNode(boneName);
    const vrmRoot = userData.vrm.scene;

    if (!bone || !vrmRoot) return;

    // 1. Get world position of the bone
    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);

    // 2. Convert to local position relative to VRM root
    const localPos = worldPos.clone();
    vrmRoot.worldToLocal(localPos);

    // 3. Create a small sphere at that position
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.005),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    marker.position.copy(localPos);

    // 4. Add it to VRM root (so it moves with the avatar)
    vrmRoot.add(marker);

    // 5. Remove the marker after a delay
    setTimeout(() => {
        vrmRoot.remove(marker);
        marker.geometry.dispose();
        marker.material.dispose();
    }, durationMs); // default 2 seconds
};


  function pointBoneLocalXToTarget(vrm, boneName, targetWorldPos, slerpFactor = 1.0) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    const vrmRoot = vrm.scene || vrm; // fallback

    if (!bone || !vrmRoot) {
        console.warn(`Bone ${boneName} not found or VRM root missing.`);
        return;
    }

    // Bone world pos
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);

    // Direction in world space
    const targetDirWorld = new THREE.Vector3().subVectors(targetWorldPos, boneWorldPos).normalize();

    // Transform direction into bone's parent local space
    const parent = bone.parent;
    if (!parent) return;

    const parentWorldQuat = new THREE.Quaternion();
    parent.getWorldQuaternion(parentWorldQuat);

    const invParentQuat = parentWorldQuat.clone().invert();
    const targetDirLocal = targetDirWorld.clone().applyQuaternion(invParentQuat);

    // From local +X to target direction
    const fromDir = new THREE.Vector3(1, 0, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(fromDir, targetDirLocal);

    // Slerp from current local rotation
    bone.quaternion.slerp(quat, slerpFactor);

    // Optional debug line
      const lineName = `TargetLine_${boneName}`;
      const oldLine = vrmRoot.getObjectByName(lineName);
      if (oldLine) vrmRoot.remove(oldLine);

      const targetLocalPos = targetWorldPos.clone();
      vrmRoot.worldToLocal(targetLocalPos);
      const boneLocalPos = boneWorldPos.clone();
      vrmRoot.worldToLocal(boneLocalPos);

      const geometry = new THREE.BufferGeometry().setFromPoints([boneLocalPos.clone(), targetLocalPos.clone()]);
      const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
      const line = new THREE.Line(geometry, material);
      line.name = lineName;
      vrmRoot.add(line);

      setTimeout(() => {
          vrmRoot.remove(line);
      }, 2000); // longer time for better debugging
}

function pointBoneLocalZToTarget(vrm, boneName, targetWorldPos, slerpFactor = 1.0) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    const vrmRoot = userData.vrm.scene; // or vrm.scene
    if (!bone || !vrmRoot) {
        console.warn(`Bone ${boneName} not found or VRM root missing.`);
        return;
    }

    // 1. Get bone position in VRM local space
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);
    const boneLocalPos = boneWorldPos.clone();
    vrmRoot.worldToLocal(boneLocalPos);

    // 2. Get target position in VRM local space
    const targetLocalPos = targetWorldPos.clone();
    vrmRoot.worldToLocal(targetLocalPos);

    // 3. Compute direction vector in local space
    const targetDir = new THREE.Vector3().subVectors(targetLocalPos, boneLocalPos).normalize();

    // 4. Create a quaternion that rotates +X to targetDir
    const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1), // Local X+ direction
        targetDir
    );

    // 5. Slerp the bone’s current rotation toward the desired one
    bone.quaternion.slerp(quat, slerpFactor);

    // 6. (Optional) Draw a red debug line in local VRM space
    const lineName = `TargetLine_${boneName}`;
    const oldLine = vrmRoot.getObjectByName(lineName);
    if (oldLine) vrmRoot.remove(oldLine);

    const points = [boneLocalPos.clone(), targetLocalPos.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const line = new THREE.Line(geometry, material);
    line.name = lineName;
    vrmRoot.add(line);

    // Auto-remove the line after 2 seconds
    setTimeout(() => {
        vrmRoot.remove(line);
    }, 100);
}

function pointBoneLocalYToTarget(vrm, boneName, targetWorldPos, slerpFactor = 1.0) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    const vrmRoot = userData.vrm.scene; // or vrm.scene
    if (!bone || !vrmRoot) {
        console.warn(`Bone ${boneName} not found or VRM root missing.`);
        return;
    }

    // 1. Get bone position in VRM local space
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);
    const boneLocalPos = boneWorldPos.clone();
    vrmRoot.worldToLocal(boneLocalPos);

    // 2. Get target position in VRM local space
    const targetLocalPos = targetWorldPos.clone();
    vrmRoot.worldToLocal(targetLocalPos);

    // 3. Compute direction vector in local space
    const targetDir = new THREE.Vector3().subVectors(targetLocalPos, boneLocalPos).normalize();

    // 4. Create a quaternion that rotates +X to targetDir
    const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, -1, 0), // Local X+ direction
        targetDir
    );

    // 5. Slerp the bone’s current rotation toward the desired one
    bone.quaternion.slerp(quat, slerpFactor);

    // 6. (Optional) Draw a red debug line in local VRM space
    const lineName = `TargetLine_${boneName}`;
    const oldLine = vrmRoot.getObjectByName(lineName);
    if (oldLine) vrmRoot.remove(oldLine);

    const points = [boneLocalPos.clone(), targetLocalPos.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const line = new THREE.Line(geometry, material);
    line.name = lineName;
    vrmRoot.add(line);

    // Auto-remove the line after 2 seconds
    setTimeout(() => {
        vrmRoot.remove(line);
    }, 100);
}




// Function to add an AxesHelper to a specific bone
function addAxesHelperToBone(vrm, boneName, size = 0.1) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (bone) {
        const axesHelper = new THREE.AxesHelper(size);
        axesHelper.name = `AxesHelper_${boneName}`; // Give it a name for easy removal
        bone.add(axesHelper); // Add it as a child of the bone
        //console.log(`AxesHelper added to ${boneName}. Local axes: X (red), Y (green), Z (blue)`);
    } else {
        console.warn(`Bone ${boneName} not found for AxesHelper.`);
    }
}

// Call this AFTER your VRM is loaded and added to the scene
// Example:
if (userData.vrm) {
    //addAxesHelperToBone(userData.vrm, 'rightUpperArm', 0.4); // Adjust size as needed
    //addAxesHelperToBone(userData.vrm, 'rightLowerArm', 0.4);
    // Add for other bones you're having trouble with (e.g., 'head')
    //addAxesHelperToBone(userData.vrm, 'head', 1);

    //addAxesHelperToBone(userData.vrm, 'rightFoot', 0.4);
    //addAxesHelperToBone(userData.vrm, 'rightUpperLeg', 0.4);
    //addAxesHelperToBone(userData.vrm, 'rightLowerLeg', 0.4);
}

  
const [currentScriptItem, setCurrentScriptItem] = useState(talkingScript[0]);

// You'll need to define this function or have it available from your project.
function pointBoneLocalXToTarget(vrm, boneName, targetWorldPos, slerpFactor = 1.0) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    const parent = bone.parent;

    if (!bone || !parent) {
        return;
    }

    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);
    const targetDirWorld = new THREE.Vector3().subVectors(targetWorldPos, boneWorldPos).normalize();

    const invParentQuat = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const targetDirLocal = targetDirWorld.clone().applyQuaternion(invParentQuat);

    const fromDir = new THREE.Vector3(1, 0, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(fromDir, targetDirLocal);

    bone.quaternion.slerp(quat, slerpFactor);
}

// Global variable to keep track of frames
let frameCounter = 0;

// Global variable to store the calculated bone positions
let lastFabrikChainPositions = null;
const boneChain = ['rightUpperArm', 'rightLowerArm', 'rightHand', 'rightMiddleProximal'];

// The main FABRIK calculation function that returns the new positions
function calculateFabrikChain(vrm, targetWorldPos) {
    const bones = boneChain.map(name => vrm.humanoid.getNormalizedBoneNode(name));

    if (!bones.every(b => b)) {
        return null;
    }

    const bonePositions = bones.map(bone => {
        const pos = new THREE.Vector3();
        bone.getWorldPosition(pos);
        return pos;
    });

    const segmentLengths = [];
    for (let i = 0; i < bones.length - 1; i++) {
        segmentLengths.push(bonePositions[i].distanceTo(bonePositions[i + 1]));
    }

    const maxIterations = 5;
    const tolerance = 0.01;

    for (let i = 0; i < maxIterations; i++) {
        const endEffectorPos = bonePositions[bones.length - 1];
        if (endEffectorPos.distanceTo(targetWorldPos) < tolerance) {
            break;
        }

        // --- Backward Reaching ---
        bonePositions[bones.length - 1].copy(targetWorldPos);
        for (let j = bones.length - 2; j >= 0; j--) {
            const parentPos = bonePositions[j];
            const childPos = bonePositions[j + 1];
            const length = segmentLengths[j];
            const direction = new THREE.Vector3().subVectors(parentPos, childPos).normalize();
            parentPos.copy(childPos).addScaledVector(direction, length);
        }

        // --- Forward Reaching ---
        const shoulderWorldPos = new THREE.Vector3();
        bones[0].getWorldPosition(shoulderWorldPos);
        bonePositions[0].copy(shoulderWorldPos);
        for (let j = 1; j < bones.length; j++) {
            const parentPos = bonePositions[j - 1];
            const childPos = bonePositions[j];
            const length = segmentLengths[j - 1];
            const direction = new THREE.Vector3().subVectors(childPos, parentPos).normalize();
            childPos.copy(parentPos).addScaledVector(direction, length);
        }
    }

    return bonePositions;
}

const boneChainFoot = ['rightUpperLeg', 'rightLowerLeg'];

// The main FABRIK calculation function that returns the new positions
function calculateFabrikFootChain(vrm, targetWorldPos) {
    const bones = boneChainFoot.map(name => vrm.humanoid.getNormalizedBoneNode(name));

    if (!bones.every(b => b)) {
        return null;
    }

    const bonePositions = bones.map(bone => {
        const pos = new THREE.Vector3();
        bone.getWorldPosition(pos);
        return pos;
    });

    const segmentLengths = [];
    for (let i = 0; i < bones.length - 1; i++) {
        segmentLengths.push(bonePositions[i].distanceTo(bonePositions[i + 1]));
    }

    const maxIterations = 5;
    const tolerance = 0.001;

    for (let i = 0; i < maxIterations; i++) {
        const endEffectorPos = bonePositions[bones.length - 1];
        if (endEffectorPos.distanceTo(targetWorldPos) < tolerance) {
            break;
        }

        // --- Backward Reaching ---
        bonePositions[bones.length - 1].copy(targetWorldPos);
        for (let j = bones.length - 2; j >= 0; j--) {
            const parentPos = bonePositions[j];
            const childPos = bonePositions[j + 1];
            const length = segmentLengths[j];
            const direction = new THREE.Vector3().subVectors(parentPos, childPos).normalize();
            parentPos.copy(childPos).addScaledVector(direction, length);
        }

        // --- Forward Reaching ---
        const hipWorldPos = new THREE.Vector3();
        bones[0].getWorldPosition(hipWorldPos);
        bonePositions[0].copy(hipWorldPos);
        for (let j = 1; j < bones.length; j++) {
            const parentPos = bonePositions[j - 1];
            const childPos = bonePositions[j];
            const length = segmentLengths[j - 1];
            const direction = new THREE.Vector3().subVectors(childPos, parentPos).normalize();
            childPos.copy(parentPos).addScaledVector(direction, length);
        }
    }

    return bonePositions;
}


  useFrame((_, delta) => {
    if (manualAnimation === "None" || null) {
      setManualAnimation("Idle");
      console.log("Animation changed to Idle");
    }
    if (!userData.vrm) {
      return;
    }
  
  /*
  if (!meshToAttach) return;

  const elapsed = (performance.now() - startTime) / 500; // seconds
  const value = (Math.sin(elapsed * Math.PI) + 1) / 2; // sine oscillates -1→1, scale to 0→1

  meshToAttach.traverse((child) => {
    if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
      const index = child.morphTargetDictionary["Key 1"];
      if (index !== undefined) {
        child.morphTargetInfluences[0] = value * 0.75;
        //child.needsUpdate = true;
      }
    }
  });
  */
    //displayBoneLocation("hips")
	//console.log(meshToAttach);

const currentAnimationAction = actions[currentAnimation];

  // Get the highest of the last 5
  maxTimeRef.current = Math.max(...previousTimes);
  if(isBowFullyCharged){
    maxTimeRef.current = 3;
    previousTimes.push(3);
    if (previousTimes.length > 10) previousTimes.shift();
    console.log("Looping at 1.5");
  }
  else{
    previousTime = currentAnimationAction.time;

    // Store only the last 5 times
    previousTimes.push(previousTime);
    if (previousTime > 0) {
      previousTimes.push(previousTime);
      if (previousTimes.length > 10) previousTimes.shift();
    }
  }
  
  //console.log("Max of last 100 previous times:", maxTimeRef.current);
	//console.log(previousTime)
	
  //console.log(currentWorldPosition);
  if (!videoElement) {
		if (talking === "Talking 1") {
	  if (currentScriptItemRef.current) {
		accumulatedDeltaRef.current += delta;
		//console.log(accumulatedDeltaRef.current);
		if (accumulatedDeltaRef.current >= currentScriptItemRef.current.time) {
		  scriptIndexRef.current += 1;
		  currentScriptItemRef.current = talkingScript[scriptIndexRef.current] || talkingScript[0];
		  accumulatedDeltaRef.current = 0;
		  
		  console.log(currentScriptItemRef.current, scriptIndexRef.current)
		}
	  } else {
		scriptIndexRef.current = 0;
		currentScriptItemRef.current = talkingScript[0];
	  }
	} else {
	  accumulatedDeltaRef.current = 0;
	  scriptIndexRef.current = 0;
	  currentScriptItemRef.current = null;
	}
      [
        {
          name: "aa",
          value: aa,
        },
        {
          name: "ih",
          value: ih,
        },
        {
          name: "ee",
          value: ee,
        },
        {
          name: "oh",
          value: oh,
        },
        {
          name: "ou",
          value: ou,
        },
        {
          name: "blinkLeft",
          value: blinkLeft,
        },
        {
          name: "blinkRight",
          value: blinkRight,
        },
      ].forEach((item) => {
		let blendshape = null;
    
		if (currentScriptItemRef.current) blendshape = currentScriptItemRef.current.blendShape;
        lerpExpression(item.name, item.value, blendshape, currentScriptItem.value, delta * 12);
      });
	  
    } else {
      if (riggedFace.current) {
        [
          {
            name: "aa",
            value: riggedFace.current.mouth.shape.A,
          },
          {
            name: "ih",
            value: riggedFace.current.mouth.shape.I,
          },
          {
            name: "ee",
            value: riggedFace.current.mouth.shape.E,
          },
          {
            name: "oh",
            value: riggedFace.current.mouth.shape.O,
          },
          {
            name: "ou",
            value: riggedFace.current.mouth.shape.U,
          },
          {
            name: "blinkLeft",
            value: 1 - riggedFace.current.eye.l,
          },
          {
            name: "blinkRight",
            value: 1 - riggedFace.current.eye.r,
          },
        ].forEach((item) => {
          lerpExpression(item.name, item.value, delta * 12);
        });
      }
      // Eyes
      if (lookAtTarget.current) {
        userData.vrm.lookAt.target = lookAtTarget.current;
        lookAtDestination.current.set(
          -2 * riggedFace.current.pupil.x,
          2 * riggedFace.current.pupil.y,
          0
        );
        lookAtTarget.current.position.lerp(
          lookAtDestination.current,
          delta * 5
        );
      }

      // Body
      rotateBone("neck", riggedFace.current.head, delta * 5, {
        x: 0.7,
        y: 0.7,
        z: 0.7,
      });
    }

    if (riggedPose.current) {
      rotateBone("chest", riggedPose.current.Spine, delta * 5, {
        x: 0.3,
        y: 0.3,
        z: 0.3,
      });
      rotateBone("spine", riggedPose.current.Spine, delta * 5, {
        x: 0.3,
        y: 0.3,
        z: 0.3,
      });
      rotateBone("hips", riggedPose.current.Hips.rotation, delta * 5, {
        x: 0.7,
        y: 0.7,
        z: 0.7,
      });

      // LEFT ARM
      rotateBone("leftUpperArm", riggedPose.current.LeftUpperArm, delta * 5);
      rotateBone("leftLowerArm", riggedPose.current.LeftLowerArm, delta * 5);
      // RIGHT ARM
      rotateBone("rightUpperArm", riggedPose.current.RightUpperArm, delta * 5);
      rotateBone("rightLowerArm", riggedPose.current.RightLowerArm, delta * 5);

      if (riggedLeftHand.current) {
        rotateBone(
          "leftHand",
          {
            z: riggedPose.current.LeftHand.z,
            y: riggedLeftHand.current.LeftWrist.y,
            x: riggedLeftHand.current.LeftWrist.x,
          },
          delta * 12
        );
        rotateBone(
          "leftRingProximal",
          riggedLeftHand.current.LeftRingProximal,
          delta * 12
        );
        rotateBone(
          "leftRingIntermediate",
          riggedLeftHand.current.LeftRingIntermediate,
          delta * 12
        );
        rotateBone(
          "leftRingDistal",
          riggedLeftHand.current.LeftRingDistal,
          delta * 12
        );
        rotateBone(
          "leftIndexProximal",
          riggedLeftHand.current.LeftIndexProximal,
          delta * 12
        );
        rotateBone(
          "leftIndexIntermediate",
          riggedLeftHand.current.LeftIndexIntermediate,
          delta * 12
        );
        rotateBone(
          "leftIndexDistal",
          riggedLeftHand.current.LeftIndexDistal,
          delta * 12
        );
        rotateBone(
          "leftMiddleProximal",
          riggedLeftHand.current.LeftMiddleProximal,
          delta * 12
        );
        rotateBone(
          "leftMiddleIntermediate",
          riggedLeftHand.current.LeftMiddleIntermediate,
          delta * 12
        );
        rotateBone(
          "leftMiddleDistal",
          riggedLeftHand.current.LeftMiddleDistal,
          delta * 12
        );
        rotateBone(
          "leftThumbProximal",
          riggedLeftHand.current.LeftThumbProximal,
          delta * 12
        );
        rotateBone(
          "leftThumbMetacarpal",
          riggedLeftHand.current.LeftThumbIntermediate,
          delta * 12
        );
        rotateBone(
          "leftThumbDistal",
          riggedLeftHand.current.LeftThumbDistal,
          delta * 12
        );
        rotateBone(
          "leftLittleProximal",
          riggedLeftHand.current.LeftLittleProximal,
          delta * 12
        );
        rotateBone(
          "leftLittleIntermediate",
          riggedLeftHand.current.LeftLittleIntermediate,
          delta * 12
        );
        rotateBone(
          "leftLittleDistal",
          riggedLeftHand.current.LeftLittleDistal,
          delta * 12
        );
      }

      if (riggedRightHand.current) {
        rotateBone(
          "rightHand",
          {
            z: riggedPose.current.RightHand.z,
            y: riggedRightHand.current.RightWrist.y,
            x: riggedRightHand.current.RightWrist.x,
          },
          delta * 12
        );
        rotateBone(
          "rightRingProximal",
          riggedRightHand.current.RightRingProximal,
          delta * 12
        );
        rotateBone(
          "rightRingIntermediate",
          riggedRightHand.current.RightRingIntermediate,
          delta * 12
        );
        rotateBone(
          "rightRingDistal",
          riggedRightHand.current.RightRingDistal,
          delta * 12
        );
        rotateBone(
          "rightIndexProximal",
          riggedRightHand.current.RightIndexProximal,
          delta * 12
        );
        rotateBone(
          "rightIndexIntermediate",
          riggedRightHand.current.RightIndexIntermediate,
          delta * 12
        );
        rotateBone(
          "rightIndexDistal",
          riggedRightHand.current.RightIndexDistal,
          delta * 12
        );
        rotateBone(
          "rightMiddleProximal",
          riggedRightHand.current.RightMiddleProximal,
          delta * 12
        );
        rotateBone(
          "rightMiddleIntermediate",
          riggedRightHand.current.RightMiddleIntermediate,
          delta * 12
        );
        rotateBone(
          "rightMiddleDistal",
          riggedRightHand.current.RightMiddleDistal,
          delta * 12
        );
        rotateBone(
          "rightThumbProximal",
          riggedRightHand.current.RightThumbProximal,
          delta * 12
        );
        rotateBone(
          "rightThumbMetacarpal",
          riggedRightHand.current.RightThumbIntermediate,
          delta * 12
        );
        rotateBone(
          "rightThumbDistal",
          riggedRightHand.current.RightThumbDistal,
          delta * 12
        );
        rotateBone(
          "rightLittleProximal",
          riggedRightHand.current.RightLittleProximal,
          delta * 12
        );
        rotateBone(
          "rightLittleIntermediate",
          riggedRightHand.current.RightLittleIntermediate,
          delta * 12
        );
        rotateBone(
          "rightLittleDistal",
          riggedRightHand.current.RightLittleDistal,
          delta * 12
        );
      }
    }
    
    // Step 2: Perform the expensive FABRIK calculation only every 10 frames.
    frameCounter++;
    /*
    if (frameCounter % 3 === 0) {
        const calculatedPositions = calculateFabrikChain(userData.vrm, targetPosition);
        if (calculatedPositions) {
            lastFabrikChainPositions = calculatedPositions;
            console.log("Calculated new FABRIK chain.");
        }
    }
    
    // Step 3: On every frame, apply rotations based on the last calculated chain.
    if (lastFabrikChainPositions) {
        // You can set slerpFactor to 1 to have no interpolation, or a value like 0.5 for smoothness
        const slerpFactor = 1; 
        for (let i = 0; i < boneChain.length - 1; i++) {
            pointBoneLocalXToTarget(userData.vrm, boneChain[i], lastFabrikChainPositions[i + 1], slerpFactor);
        }
    }
    */
    /*
    const hips = userData.vrm.humanoid.getNormalizedBoneNode('hips');
    hips.position.y += 0; // move hips bone upward relative to parent
    hips.updateMatrixWorld(true);
    */
    /*
    if (frameCounter % 30 === 0) {
        const calculatedPositions = calculateFabrikFootChain(userData.vrm, targetPosition);
        if (calculatedPositions) {
            lastFabrikChainPositions = calculatedPositions;
            console.log("Calculated new FABRIK chain.");
        }
    }
    
    // Step 3: On every frame, apply rotations based on the last calculated chain.
    if (lastFabrikChainPositions) {
        // You can set slerpFactor to 1 to have no interpolation, or a value like 0.5 for smoothness
        const slerpFactor = 1; 
        for (let i = 0; i < boneChainFoot.length - 1; i++) {
            pointBoneLocalYToTarget(userData.vrm, boneChainFoot[i], lastFabrikChainPositions[i + 1], slerpFactor);
        }
    }
    */
    userData.vrm.expressionManager.setValue('aa', visemeWeightsRef.current?.A || 0);
    userData.vrm.expressionManager.setValue('ee', visemeWeightsRef.current?.E || 0);
    userData.vrm.expressionManager.setValue('ii', visemeWeightsRef.current?.I || 0);
    userData.vrm.expressionManager.setValue('oo', visemeWeightsRef.current?.O || 0);
    userData.vrm.expressionManager.setValue('uu', visemeWeightsRef.current?.U || 0);
    /*
    rotateBoneAxis("head", "x", pitch.current, 1);

    // Left Arm (Support)
    rotateBoneAxis("leftUpperArm", "x", pitch.current + Math.PI / 2, 1);
    rotateBoneAxis("leftLowerArm", "x", Math.PI / 8, 1); 

    // Right Arm (Trigger)
    rotateBoneAxis("rightUpperArm", "x", pitch.current + Math.PI / 2, 1);
    rotateBoneAxis("rightLowerArm", "x", Math.PI / 8, 1); 
*/
    userData.vrm.update(delta);
    
    /*
    const targetWorldPos = new THREE.Vector3(0, -7.5, 0); // any target position
    pointBoneLocalXToTarget(vrm, 'rightUpperArm', targetPosition);
    pointBoneLocalXToTarget(vrm, "rightLowerArm", targetPosition);
    //pointBoneLocalZToTarget(vrm, "head", targetWorldPos);
    //leaveTraceAtBone("rightLowerArm");
    userData.vrm.update(delta);
    */
  });
  useEffect(() => {
  scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;      // allows the model to cast shadows
      child.receiveShadow = true;   // allows shadows to fall on it
    }
  });
}, [scene]);
  const lookAtDestination = useRef(new Vector3(0, 0, 0));
  const camera = useThree((state) => state.camera);
  const lookAtTarget = useRef();
  useEffect(() => {
    lookAtTarget.current = new Object3D();
    camera.add(lookAtTarget.current);
  }, [camera]);
  // Trigger preload if not ready
  
  return (
    <group {...props}>
      <primitive
        object={scene}
        rotation={[0, Math.PI, 0]} // X, Y, Z rotation in radians
        scale={[1, 1, 1]} // uniform scale
        position={[0, -.5, 0]}
      />

      {/* Flame is created here */}
      
      <group ref={flameRef}>
        {/*<FlameEmitter position={[0, -.5, 0]} count={50} /> */}
      </group>
    </group>
  );
};


