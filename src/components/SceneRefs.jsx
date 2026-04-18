// SceneRefs.js
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export const SceneRefs = ({ onReady }) => {
  const { gl, scene } = useThree();

  useEffect(() => {
    onReady({ gl, scene });
  }, [gl, scene]);

  return null;
};
