import React, { useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

export const StoneBox = React.forwardRef(({
  size = [2, 2, 2],
  tileSize = 1,
  boxColor = 0xf0f0f0,
}, ref) => {
  const [width, height, depth] = size;
  const colorMap = useTexture("textures/stone/color.png");

  const materials = useMemo(() => {
    const topBottomMaterial = new THREE.MeshStandardMaterial({
      map: colorMap.clone(),
      color: boxColor,
    });
    topBottomMaterial.map.wrapS = topBottomMaterial.map.wrapT = THREE.RepeatWrapping;
    topBottomMaterial.map.repeat.set(width / tileSize, depth / tileSize);

    const frontBackMaterial = new THREE.MeshStandardMaterial({
      map: colorMap.clone(),
      color: boxColor,
    });
    frontBackMaterial.map.wrapS = frontBackMaterial.map.wrapT = THREE.RepeatWrapping;
    frontBackMaterial.map.repeat.set(width / tileSize, height / tileSize);

    const leftRightMaterial = new THREE.MeshStandardMaterial({
      map: colorMap.clone(),
      color: boxColor,
    });
    leftRightMaterial.map.wrapS = leftRightMaterial.map.wrapT = THREE.RepeatWrapping;
    leftRightMaterial.map.repeat.set(depth / tileSize, height / tileSize);

    return [
      leftRightMaterial,
      leftRightMaterial,
      topBottomMaterial,
      topBottomMaterial,
      frontBackMaterial,
      frontBackMaterial,
    ];
  }, [colorMap, width, height, depth, tileSize, boxColor]);

  return (
    <mesh ref={ref}>
      <boxGeometry args={size} />
      {materials.map((material, index) => (
        <meshStandardMaterial
          key={index}
          attach={`material-${index}`}
          map={material.map}
          color={material.color}
        />
      ))}
    </mesh>
  );
});