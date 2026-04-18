import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const MouseDragHandler = ({ enabled, selectedObject, onUpdatePosition, onStopDrag }) => {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const dragging = useRef(false);
  const dragPlane = useRef(new THREE.Plane());
  const intersectionPoint = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!enabled || !selectedObject) return;

    const onMouseDown = (event) => {
      const { left, top, width, height } = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - left) / width) * 2 - 1;
      mouse.current.y = -((event.clientY - top) / height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);
      
      // We create a plane to intersect with at the object's current height
      dragPlane.current.setFromNormalAndCoplanarPoint(
        camera.up,
        selectedObject.position
      );
      
      const intersects = raycaster.current.ray.intersectPlane(dragPlane.current, intersectionPoint.current);
      if (intersects) {
        dragging.current = true;
        gl.domElement.style.cursor = "grabbing";
      }
    };

    const onMouseMove = (event) => {
      if (!dragging.current) return;

      const { left, top, width, height } = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - left) / width) * 2 - 1;
      mouse.current.y = -((event.clientY - top) / height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.ray.intersectPlane(dragPlane.current, intersectionPoint.current);

      if (intersects) {
        // Update the position of the object in the parent component's state
        onUpdatePosition(selectedObject, intersectionPoint.current);
      }
    };

    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        gl.domElement.style.cursor = "pointer";
        onStopDrag(selectedObject);
      }
    };

    gl.domElement.addEventListener("mousedown", onMouseDown);
    gl.domElement.addEventListener("mousemove", onMouseMove);
    gl.domElement.addEventListener("mouseup", onMouseUp);

    return () => {
      gl.domElement.removeEventListener("mousedown", onMouseDown);
      gl.domElement.removeEventListener("mousemove", onMouseMove);
      gl.domElement.removeEventListener("mouseup", onMouseUp);
      gl.domElement.style.cursor = "auto";
    };
  }, [enabled, selectedObject, camera, gl, onUpdatePosition, onStopDrag]);

  return null;
};

export default MouseDragHandler;