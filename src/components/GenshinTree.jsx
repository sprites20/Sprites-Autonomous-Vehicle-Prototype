import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uMap;
  void main() {
    vec4 texColor = texture2D(uMap, vUv);
    
    // Increase threshold for a sharper look
    if (texColor.a < 0.5) discard; 
    
    // Lighten the AO slightly so they don't vanish against dark soil
    float ao = vUv.y * 0.3 + 0.7; 
    
    gl_FragColor = vec4(texColor.rgb * ao, 1.0);
  }
`;

const createLeafTexture = (colors) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512; 
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const drawMiniLeaf = (x, y, angle, scale, color) => {
    ctx.save();
    ctx.translate(x, y); 
    ctx.rotate(angle); 
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Slightly wider leaf shape for better visibility
    ctx.bezierCurveTo(12, -15, 12, -30, 0, -45);
    ctx.bezierCurveTo(-12, -30, -12, -15, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  // Fewer, larger leaves per cluster (approx 15-18 instead of 25)
  // This makes each leaf "read" better from a distance
  for (let i = 0; i < 40; i++) {
    const x = 256 + (Math.random() - 0.5) * 320;
    const y = 256 + (Math.random() - 0.5) * 320;
    const angle = Math.random() * Math.PI * 2;
    // INCREASED: Individual leaf scale from 0.3-0.7 to 0.6-0.9
    const scale = 1 + Math.random() * 0.3;
    const color = colors[i % colors.length];
    drawMiniLeaf(x, y, angle, scale, color);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
};

const GenshinTree = ({ config }) => {
  const leafRef = useRef();
  const branchRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const worldOffset = useMemo(() => new THREE.Vector3(...(config.pos || [0, 0, 0])), [config.pos]);

  const { leafNodes, branchSegments } = useMemo(() => {
    const leafNodes = [];
    const branchSegments = [];
    const baseThickness = config.shape === 'pine' ? 0.8 : 0.3; 

    const addBranch = (pos, quat, scale) => {
      branchSegments.push({ pos, quat, scale });
    };

    const createBranch = (start, dir, length, thickness, depth) => {
      if (depth > (config.recursion || 6) || thickness < 0.01) return;
      const end = start.clone().add(dir.clone().multiplyScalar(length));
      
      addBranch(
        start.clone().add(end).multiplyScalar(0.5).add(worldOffset),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
        [thickness, length, thickness]
      );

      if (depth >= 2) {
        const density = depth >= 4 ? 7 : 4;
        for (let i = 0.3; i <= 1.0; i += 1.0 / density) {
          leafNodes.push({
            pos: start.clone().lerp(end, i).add(worldOffset),
            dir: dir.clone(),
            scale: (depth / (config.recursion || 6)) * 1.6,
            randomRotation: Math.random() * Math.PI * 2,
          });
        }
      }

      const num = (depth === 0) ? 4 : 2;
      for (let i = 0; i < num; i++) {
        const sproutPoint = start.clone().lerp(end, 0.6 + Math.random() * 0.4);
        const angleY = (i / num) * Math.PI * 2 + (depth * 2);
        let newDir = dir.clone().add(new THREE.Vector3(0, 0.4, 0)).normalize();
        newDir.applyAxisAngle(new THREE.Vector3(Math.cos(angleY), 0, Math.sin(angleY)), 0.7);
        createBranch(sproutPoint, newDir, length * 0.75, thickness * 0.65, depth + 1);
      }
    };

    if (config.shape === 'pine') {
      const segments = 40;
      const segH = (config.height || 20) / segments;
      for (let i = 0; i < segments; i++) {
        const p = i / segments;
        const r = baseThickness * Math.pow(1 - p, 1.5);
        addBranch(new THREE.Vector3(worldOffset.x, worldOffset.y + i * segH + segH/2, worldOffset.z), new THREE.Quaternion(), [r, segH, r]);

        if (i * segH > config.trunkHeight) {
          const hf = 1.0 - p;
          for (let j = 0; j < 6; j++) {
            const angle = (j / 6) * Math.PI * 2;
            const bDir = new THREE.Vector3(Math.cos(angle), -0.1, Math.sin(angle)).normalize();
            const bLen = (config.branchLength || 10) * hf;
            const bStart = new THREE.Vector3(0, i * segH, 0); 
            const bEnd = bStart.clone().add(bDir.clone().multiplyScalar(bLen));
            addBranch(bStart.clone().add(bEnd).multiplyScalar(0.5).add(worldOffset), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bDir), [0.05 * hf, bLen, 0.05 * hf]);
            
            for(let n=0; n<5; n++) {
              leafNodes.push({ pos: bStart.clone().lerp(bEnd, n/5).add(worldOffset), dir: bDir.clone(), scale: hf * 1.5, randomRotation: Math.random() * Math.PI });
            }
          }
        }
      }
    } else {
        addBranch(new THREE.Vector3(worldOffset.x, worldOffset.y + config.trunkHeight / 2, worldOffset.z), new THREE.Quaternion(), [baseThickness, config.trunkHeight, baseThickness]);
        createBranch(new THREE.Vector3(0, config.trunkHeight, 0), new THREE.Vector3(0, 1, 0), config.height, baseThickness, 0);
    }

    return { leafNodes, branchSegments };
  }, [config, worldOffset]);

  const leafMap = useMemo(() => createLeafTexture(config.leafColors), [config.leafColors]);

  useEffect(() => {
    // Branch Matrices
    branchSegments.forEach((b, i) => {
      dummy.position.copy(b.pos);
      dummy.quaternion.copy(b.quat);
      dummy.scale.set(b.scale[0], b.scale[1], b.scale[2]);
      dummy.updateMatrix();
      branchRef.current.setMatrixAt(i, dummy.matrix);
    });
    branchRef.current.instanceMatrix.needsUpdate = true;

    // Leaf Matrices
    leafNodes.forEach((node, i) => {
      dummy.position.copy(node.pos);
      //dummy.quaternion.copy(node.quaternion);
      dummy.lookAt(node.pos.clone().add(node.dir));
      dummy.rotateX(Math.PI / 2);
      dummy.rotateZ(node.randomRotation);
      // Overall cluster scale
      dummy.scale.setScalar(node.scale * 4.8); 
      dummy.updateMatrix();
      leafRef.current.setMatrixAt(i, dummy.matrix);
    });
    leafRef.current.instanceMatrix.needsUpdate = true;
  }, [branchSegments, leafNodes, dummy]);

  return (
    <group>
      <instancedMesh ref={branchRef} args={[null, null, branchSegments.length]} castShadow receiveShadow frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 6]} /> 
        <meshStandardMaterial color={config.trunkColor} roughness={0.9} />
      </instancedMesh>

      <instancedMesh ref={leafRef} args={[null, null, leafNodes.length]} castShadow receiveShadow frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={{ uMap: { value: leafMap } }}
          side={THREE.DoubleSide}
          transparent={true}  // 👈 Required for the discard to "see" the background
          alphaTest={0.5}     // 👈 Helps with depth clipping
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
};

export default GenshinTree;