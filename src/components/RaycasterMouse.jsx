import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import React, { useMemo, useRef, useEffect, useState } from "react";
import { targetPosition } from "./TargetPosition";

export const RaycastOnMouseHover = () => {
  const { camera, scene, gl } = useThree();

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useRef(new THREE.Vector2());
  const debugSphereRef = useRef();
  const [raycastTargets, setRaycastTargets] = useState([]);
  const lastRaycastTime = useRef(0);
  const raycastInterval = 16; // Time in milliseconds between raycasts (e.g., ~60 FPS)

  // Mouse movement tracking with a delay
  useEffect(() => {
    const handleMouseMove = (event) => {
      const now = performance.now();
      if (now < lastRaycastTime.current + raycastInterval) {
        return; // Skip if the interval hasn't passed
      }
      lastRaycastTime.current = now;

      const { left, top, width, height } = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - left) / width) * 2 - 1;
      const y = -((event.clientY - top) / height) * 2 + 1;
      mouse.current.set(x, y);

      raycaster.setFromCamera(mouse.current, camera);
      const intersects = raycaster.intersectObjects(raycastTargets, true);

      if (intersects.length > 0) {
        const hit = intersects[0];
        targetPosition.copy(hit.point);
      }
    };

    if (raycastTargets.length) {
      window.addEventListener("pointermove", handleMouseMove);
    }
    
    return () => {
      window.removeEventListener("pointermove", handleMouseMove);
    };
  }, [gl, camera, raycaster, raycastTargets, raycastInterval]);

  // Debug sphere setup
  useEffect(() => {
    const geometry = new THREE.SphereGeometry(0.025, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = "debug";
    scene.add(sphere);
    debugSphereRef.current = sphere;

    return () => {
      scene.remove(sphere);
      geometry.dispose();
      material.dispose();
    };
  }, [scene]);

  // Gather raycast targets
  useEffect(() => {
    const meshes = [];
    scene.traverse((obj) => {
      if (obj.isMesh && obj.name !== "debug") {
        meshes.push(obj);
      }
    });
    setRaycastTargets(meshes);
  }, [scene]);

  useFrame(() => {
    // Only use useFrame for the lerp to create smooth movement
    if (debugSphereRef.current) {
      debugSphereRef.current.position.lerp(targetPosition, 0.2);
    }
  });

  return null;
};