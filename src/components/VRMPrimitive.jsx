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
import * as THREE from 'three'; // Make sure THREE is imported
import { preloadAvatar, getAvatarUrlSync, makeAvatarUrl } from "./avatarCache";

const tmpVec3 = new Vector3();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpMatrix = new Matrix4();
const blobUrlCache = new Map();

// helper hook to force re-render
function useForceUpdate() {
  const [, setTick] = useState(0);
  return () => setTick((t) => t + 1);
}
export const VRMPrimitive = ({ 
	avatar,
  isMoving,
	//manualAnimation = "Idle",
	...props 

}) => {
  const forceUpdate = useForceUpdate();
  const modelUrl = avatar;

  const isTalking = true;
  const [talkingTimestamp, setTalkingTimestamp] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const scriptIndexRef = useRef(0);
  const maxTimeRef = useRef(0);  // persists between renders
  const accumulatedDeltaRef = useRef(0); // Use useRef to persist accumulatedDelta
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
  // Still call useGLTF even if modelUrl is missing → pass a dummy
  // Always pass something valid to useGLTF
  const { scene, userData } = useGLTF(
    modelUrl,
    undefined,
    undefined,
    (loader) => loader.register((parser) => new VRMLoaderPlugin(parser)),
    { clone: true }
  );


  const currentVrm = userData.vrm;

  //console.log("modelURL", modelUrl);
  //console.log("currentVrm", currentVrm);

  const assetA = useFBX("models/animations/Swing Dancing.fbx");
  const assetB = useFBX("models/animations/Thriller Part 2.fbx");
  const assetC = useFBX("models/animations/Breathing Idle.fbx");
  const assetD = useFBX("models/animations/Samba Dancing.fbx");
  const assetStartWalking = useFBX("models/animations/Female Start Walking.fbx")
  const assetWalking = useFBX("models/animations/Walking.fbx")
  const assetBallet = useFBX("models/animations/Ballet.fbx")
  
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

// Collect all non-null clips
const clips = [
  animationClipA,
  animationClipB,
  animationClipC,
  animationClipD,
  animationClipStartWalking,
  animationClipWalking,
  animationClipBallet
].filter(Boolean);

// Use animations
const { actions } = useAnimations(clips, currentVrm?.scene ?? null);

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

    
  }, [scene]);

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
  useEffect(() => {
    // Play idle animation by default
    // Check isMoving prop and crossfade to walking
    if (isMoving) {
      setManualAnimation("Walking")
    } else {
      setManualAnimation("Idle")
    }
    // Consider how transitions should work if you have other animations like jumping etc.
    // This is a basic example.
    // Clean up actions on unmount
    return () => {
      actions[currentAnimation]?.stop();
    };
  }, [isMoving, currentAnimation, actions]); // Dependency array should include isMoving and actions

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


useEffect(() => {
  // Handle keydown event to track which keys are pressed
  
  const handleKeyDown = (e) => {
    if (e.key.toLowerCase() === "w" || e.key.toLowerCase() === "a" || e.key.toLowerCase() === "s" || e.key.toLowerCase() === "d") {
      keys.current[e.key.toLowerCase()] = true;
      setManualAnimation("Walking"); // Start walking animation when any of the movement keys are pressed
    }
  };

  // Handle keyup event to check if any of the keys are still pressed
  const handleKeyUp = (e) => {
    if (e.key.toLowerCase() === "w" || e.key.toLowerCase() === "a" || e.key.toLowerCase() === "s" || e.key.toLowerCase() === "d") {
      keys.current[e.key.toLowerCase()] = false;
      
      // If none of the keys are pressed, set animation to Idle
      if (!keys.current.w && !keys.current.a && !keys.current.s && !keys.current.d) {
        setManualAnimation("Idle");
      }
    }
  };

  //window.addEventListener("keydown", handleKeyDown);
  //window.addEventListener("keyup", handleKeyUp);
  setManualAnimation("Idle");
  return () => {
    //window.removeEventListener("keydown", handleKeyDown);
    //window.removeEventListener("keyup", handleKeyUp);
    setManualAnimation("Idle");
  };
}, []);

useEffect(() => {
  if (currentAnimation === "None" || videoElement) currentAnimation = "Idle";
  actions[currentAnimation]?.play();
  return () => {
    actions[currentAnimation]?.stop();
  };
}, [actions, currentAnimation, videoElement]);

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
  
  const pointBoneToTarget = (boneName, targetWorldPos, slerpFactor = 1.0, up = new THREE.Vector3(0, 1, 0)) => {
    const bone = userData.vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) {
      console.warn(`Bone ${boneName} not found in VRM humanoid.`);
      return;
    }
  
    // Get the VRM's world position
    const vrmWorldPos = new THREE.Vector3();
    userData.vrm.scene.getWorldPosition(vrmWorldPos);
  
    // Calculate the relative target position
    const relativeTargetPos = new THREE.Vector3().subVectors(targetWorldPos, vrmWorldPos);
  
    // Get the bone's world position
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);
  
    // Calculate direction from bone to target using relative coordinates
    const direction = new THREE.Vector3().subVectors(relativeTargetPos, boneWorldPos).normalize();
  
    // Create a quaternion to rotate the bone to face the target
    const lookQuat = new THREE.Quaternion();
    tmpMatrix.lookAt(boneWorldPos, relativeTargetPos, up); // reuse global tmpMatrix
    lookQuat.setFromRotationMatrix(tmpMatrix);
  
    // Convert world rotation to local space
    if (bone.parent) {
      const parentQuatInv = new THREE.Quaternion().copy(bone.parent.getWorldQuaternion(tmpQuat)).invert();
      lookQuat.premultiply(parentQuatInv);
    }
  
    // Smoothly rotate the bone toward the target
    bone.quaternion.slerp(lookQuat, slerpFactor);
  };
  
  
const [currentScriptItem, setCurrentScriptItem] = useState(talkingScript[0]);


  useFrame((_, delta) => {
    if (manualAnimation === "None" || null) {
      setManualAnimation("Idle");
      console.log("Animation changed to Idle");
    }
    if (!userData.vrm) {
      return;
    }
    
	
const currentAnimationAction = actions[currentAnimation];
previousTime = currentAnimationAction.time;

// Store only the last 5 times
previousTimes.push(previousTime);
if (previousTime > 0) {
  previousTimes.push(previousTime);
  if (previousTimes.length > 10) previousTimes.shift();
}

// Get the highest of the last 5
maxTimeRef.current = Math.max(...previousTimes);
//console.log("Max of last 100 previous times:", maxTimeRef.current);
	//console.log(previousTime)
	

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
    
    userData.vrm.update(delta);
    //pointBoneToTarget("rightUpperArm", new THREE.Vector3(0, 0, 0));
    //userData.vrm.update(delta);
  });

  const lookAtDestination = useRef(new Vector3(0, 0, 0));
  const camera = useThree((state) => state.camera);
  const lookAtTarget = useRef();
  
 

  return (
    <group {...props}>
      <primitive
        object={scene}
        rotation-y={avatar !== "3636451243928341470.vrm" ? Math.PI : 0}
        scale={[1.25, 1.25, 1.25]} // uniform scale
        position={[0, 0, 0]}
      />
    </group>
  );
};


