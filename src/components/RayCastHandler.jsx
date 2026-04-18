import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const RaycastClickHandler = () => {
  const raycaster = useRef(new THREE.Raycaster());
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    const onClick = (event) => {
      const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.current.setFromCamera(mouse, camera);
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit.parent && !hit.name) hit = hit.parent; // walk up for a named parent
        console.log("Clicked object:", hit.name || "(Unnamed)", hit);
      }
    };

    gl.domElement.addEventListener("click", onClick);
    return () => gl.domElement.removeEventListener("click", onClick);
  }, [camera, gl, scene]);

  return null;
};
export default RaycastClickHandler;