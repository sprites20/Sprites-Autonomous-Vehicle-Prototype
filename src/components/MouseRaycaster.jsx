import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

export const useMouseRaycaster = (objectsToTest) => {
  const { camera, scene, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const [intersection, setIntersection] = useState(null);

  useEffect(() => {
    const onMouseMove = (event) => {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      mouse.current.x = (event.clientX / gl.domElement.clientWidth) * 2 - 1;
      mouse.current.y = -(event.clientY / gl.domElement.clientHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [gl]);

  useFrame(() => {
    if (!objectsToTest || objectsToTest.length === 0) {
      setIntersection(null);
      return;
    }

    raycaster.current.setFromCamera(mouse.current, camera);
    
    // Find intersections with the provided objects
    const intersects = raycaster.current.intersectObjects(objectsToTest, true);

    if (intersects.length > 0) {
      // The first object in the array is the closest one
      setIntersection(intersects[0]);
    } else {
      setIntersection(null);
    }
  });

  return intersection;
};