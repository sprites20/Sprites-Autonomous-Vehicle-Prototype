import { Billboard, CameraControls, Text, Capsule} from "@react-three/drei";
import React, { useEffect, useRef, useState, useImperativeHandle } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, CapsuleCollider, RigidBody } from "@react-three/rapier";
import { VRMPrimitive } from "./VRMPrimitive";
import * as THREE from "three";
import { eventBus } from "./EventBus";
import { targetPosition } from './TargetPosition';
import { SoundEmitter } from './SoundEmitter';
import { preloadAvatar, getAvatarUrlSync, makeAvatarUrl } from "./avatarCache";


const MOVEMENT_SPEED = 3;
const JUMP_FORCE = 2;
const STEP_HEIGHT = 0.4;
const STEP_DISTANCE = 0.4;

export const AIController = React.forwardRef(({
  avatar,
  cameraControls,
  world,
  name,
  ...props
}, ref) => {
  const groupRef = useRef();
  const rigidbodyRef = useRef();

  // Expose the group to the parent
  // Expose both group and userData
  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    get rigidbody() {
      return rigidbodyRef;
    },
    get userData() {
      return groupRef.current?.userData;
    }
  }));

  // Set userData after mount
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.userData.name = name;
      groupRef.current.userData.isTopLevel = true;
      groupRef.current.userData.id = crypto.randomUUID();
    }

    // ✅ Attach AI metadata to the physics body itself
    if (rigidbodyRef.current) {
      rigidbodyRef.current.userData = {
        isAI: true, // 👈 this makes it detectable by sword colliders
        name,
        controller: {
          takeDamage: (amount) => {
            console.log(`${name} took ${amount} damage`);
            // You can manage HP or death here later
          },
        },
      };
    }
  }, [name]);

  const keys = useRef({});
  // Use a state for isMoving that only updates when necessary
  const [isMovingState, setIsMovingState] = useState(false);
  const [chatMessage, setChatMessage] = useState(null);
  
  // Use refs for fast-updating values inside useFrame
  const isMovingRef = useRef(false);
  const isGroundedRef = useRef(true);

  const { gl, scene } = useThree();
  const { rapier } = useRapier();

  useEffect(() => {
    const mailbox = (message) => {
      setChatMessage(`${message.from} said: ${message.content}`);
      setTimeout(() => setChatMessage(null), 3000);
    };

    eventBus.register(name, mailbox);
    return () => eventBus.unregister(name);
  }, [name]);

  const audioRef = useRef();

  useEffect(() => {
    if (chatMessage) {
      const message = { from: name, content: chatMessage };
      console.log(message);
    }
  }, [chatMessage]);

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


    if (groupRef.current) {
      groupRef.current.add(sound);
      audioRef.current = sound;
    }

    console.log("Chat Message:", chatMessage);

    return () => {
      sound.stop();
      cameraControls.current.camera.remove(listener);
    };
    }
  }, [cameraControls]);

  // Use useEffect to update the state variable only when the ref changes
  useEffect(() => {
    // This will only run when isMovingRef.current changes its value
    setIsMovingState(isMovingRef.current);
  }, [isMovingRef.current]);

  useFrame(() => {
    if (!rigidbodyRef.current) return;

    const position = rigidbodyRef.current.translation();
    const currentPos = new THREE.Vector3(position.x, position.y, position.z);

    // --- Movement direction to target ---
    const dirToTarget = new THREE.Vector3().subVectors(targetPosition, currentPos);
    dirToTarget.y = 0;
    var isMoving = dirToTarget.lengthSq() > 0.0001;
    if (isMoving) dirToTarget.normalize();

    const moveVec = dirToTarget.clone();
    const speed = MOVEMENT_SPEED;

    // --- Update moving ref and state ---
    if (isMovingRef.current !== isMoving) {
      isMovingRef.current = isMoving;
      setIsMovingState(isMoving);
    }
    isMoving = false;
    if (isMoving) {
      // Face target
      const angle = Math.atan2(moveVec.x, moveVec.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
      rigidbodyRef.current.setRotation(q, true);

      // === Step snapping logic ===
      const forwardOffset = 0.25;
      const direction = new rapier.Vector3(moveVec.x, 0, moveVec.z);
      const origin = new rapier.Vector3(
        position.x + direction.x * forwardOffset,
        position.y - 0.025,
        position.z + direction.z * forwardOffset
      );
      const ray = new rapier.Ray(origin, direction);
      const hit = world.castRay(ray, STEP_DISTANCE, true);

      if (hit && hit.timeOfImpact < STEP_DISTANCE) {
        const stepPoint = ray.pointAt(hit.timeOfImpact);
        const upperOrigin = new rapier.Vector3(stepPoint.x, stepPoint.y + STEP_HEIGHT, stepPoint.z);
        const upperRay = new rapier.Ray(upperOrigin, direction);
        const upperHit = world.castRay(upperRay, STEP_DISTANCE, true);

        if (!upperHit || upperHit.timeOfImpact > 0.9) {
          rigidbodyRef.current.setTranslation(
            { x: position.x, y: position.y + STEP_HEIGHT / 2, z: position.z },
            true
          );
        }
      }

      // Set velocity without fighting gravity
      const vel = rigidbodyRef.current.linvel();
      rigidbodyRef.current.setLinvel(
        { x: moveVec.x * speed, y: vel.y, z: moveVec.z * speed },
        true
      );
    } else {
      const vel = rigidbodyRef.current.linvel();
      rigidbodyRef.current.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
    }

    // --- Grounded check ---
    const grounded = position.y <= 0.1;
    if (isGroundedRef.current !== grounded) {
      isGroundedRef.current = grounded;
    }

    // --- Jump ---
    if (keys.current[" "] && isGroundedRef.current) {
      rigidbodyRef.current.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true);
      isGroundedRef.current = false;
    }

    

  });
  const [avatarReady, setAvatarReady] = useState(false);
    const [url, setUrl] = useState(null);
    
    useEffect(() => {
      const modelUrl = getAvatarUrlSync(avatar);
      setUrl(modelUrl);
    
      if (!modelUrl) {
        preloadAvatar(avatar).then(() => {
          const newUrl = makeAvatarUrl(avatar);
          setUrl(newUrl);
          setAvatarReady(true);
        });
      } else {
        setAvatarReady(true);
      }
    }, [avatar]);
    
    if (!avatarReady) return null; // actually waits
  return (
    <>
      <RigidBody
        ref={rigidbodyRef}
        colliders={false}
        type="dynamic"
        friction={0.2}
        linearDamping={0.05}
        lockRotations
      >
        <group ref={groupRef} {...props}>
          <VRMPrimitive avatar={url} isMoving={isMovingState} />
        </group>

        {chatMessage && (
          <Billboard position={[0, 2.5, 0]} follow>
            <Text
              fontSize={0.1}
              color="white"
              anchorX="center"
              anchorY="bottom"
              outlineColor="black"
              outlineWidth={0.03}
            >
              {chatMessage}
            </Text>
          </Billboard>
        )}

      <CapsuleCollider args={[0.75, 0.3]} position={[0, 0.75, 0]} />
        {/* Visible capsule mesh for debugging 
        <Capsule args={[0.3, 0.3]} position={[0, 2, 0]}>
          <meshStandardMaterial color="hotpink" wireframe />
        </Capsule>
        */}
      </RigidBody>
    </>
  );
});
