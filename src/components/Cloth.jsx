import { RigidBody, useSphericalJoint } from "@react-three/rapier";
import { useRef, useMemo, useState, useEffect } from "react";
import { Vector3, DoubleSide } from "three";
import { useFrame } from "@react-three/fiber";

function PhysicsJoint({ bodyA, bodyB, anchorA, anchorB }) {
  useSphericalJoint(bodyA, bodyB, [anchorA, anchorB]);
  return null;
}

export function Cloth({
  type = "tshirt",
  spacing = 0.2,
  particleRadius = 0.04,
  color = "white",
  initialPosition = new Vector3(0, 2, 0),
}) {
  const particleMap = useRef(new Map());
  const geomRef = useRef();
  const [ready, setReady] = useState(false);

  // Configuration
  const grid = { rows: 14, cols: 14, sleeveHeight: 5, torsoWidth: 8, neckWidth: 4 };
  const torsoStart = (grid.cols - grid.torsoWidth) / 2;
  const torsoEnd = torsoStart + grid.torsoWidth;
  const neckStart = (grid.cols - grid.neckWidth) / 2;
  const neckEnd = neckStart + grid.neckWidth;

  const isPartOfShirt = (r, c) => {
    if (type === "square") return true;
    const isNeckHole = r === 0 && c >= neckStart && c < neckEnd;
    if (isNeckHole) return false;

    const inSleeveRow = r < grid.sleeveHeight;
    const inTorsoCol = c >= torsoStart && c < torsoEnd;
    return inSleeveRow || inTorsoCol;
  };

  const { particles, joints, indices } = useMemo(() => {
    const p = [];
    const j = [];
    const idxs = [];
    const indexMap = new Map();
    const layers = type === "tshirt" ? ["front", "back"] : ["front"];
    const zThickness = type === "tshirt" ? spacing * 0.2 : 0;

    // 1. Create Particles
    layers.forEach((layer) => {
      const zPos = layer === "front" ? zThickness : -zThickness;
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          if (!isPartOfShirt(r, c)) continue;
          const id = `${layer}-${r}-${c}`;
          indexMap.set(id, p.length);
          // Pin shoulders for hanging
          const isShoulder = r === 0;
          p.push({ id, r, c, layer, z: zPos, pinned: isShoulder });
        }
      }
    });

    // 2. Build Joints and Mesh
    layers.forEach((layer) => {
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          if (!isPartOfShirt(r, c)) continue;
          const id = `${layer}-${r}-${c}`;

          // Structural Joints
          if (c < grid.cols - 1 && isPartOfShirt(r, c + 1)) {
            j.push({
              id: `h-${id}`, a: id, b: `${layer}-${r}-${c + 1}`,
              anchorA: [spacing / 2, 0, 0], anchorB: [-spacing / 2, 0, 0],
            });
          }
          if (r < grid.rows - 1 && isPartOfShirt(r + 1, c)) {
            j.push({
              id: `v-${id}`, a: id, b: `${layer}-${r + 1}-${c}`,
              anchorA: [0, -spacing / 2, 0], anchorB: [0, spacing / 2, 0],
            });
          }

          // Geometry Indices
          if (r < grid.rows - 1 && c < grid.cols - 1 && isPartOfShirt(r + 1, c + 1)) {
            const a = indexMap.get(`${layer}-${r}-${c}`);
            const b = indexMap.get(`${layer}-${r + 1}-${c}`);
            const c_idx = indexMap.get(`${layer}-${r}-${c + 1}`);
            const d = indexMap.get(`${layer}-${r + 1}-${c + 1}`);
            if (a !== undefined && b !== undefined && c_idx !== undefined && d !== undefined) {
              if (layer === "front") idxs.push(a, b, c_idx, b, d, c_idx);
              else idxs.push(a, c_idx, b, b, c_idx, d);
            }
          }

          // 3. SEAM LOGIC
          if (type === "tshirt" && layer === "front") {
            const backId = `back-${r}-${c}`;
            
            // Logic for where the fabric is SEWN together
            const isShoulderTop = r === 0; 
            const isSideOfTorso = (c === torsoStart || c === torsoEnd - 1) && r >= grid.sleeveHeight;
            const isBottomSleeve = r === grid.sleeveHeight - 1 && (c < torsoStart || c >= torsoEnd);
            
            // ARM HOLE LOGIC: Do NOT sew if it's the very edge of the sleeve
            const isArmHole = (c === 0 || c === grid.cols - 1) && r < grid.sleeveHeight;

            if ((isShoulderTop || isSideOfTorso || isBottomSleeve) && !isArmHole) {
                j.push({
                  id: `seam-${r}-${c}`, a: id, b: backId,
                  anchorA: [0, 0, -zThickness], anchorB: [0, 0, zThickness]
                });

                // Mesh bridging for the seams
                [[r + 1, c], [r, c + 1]].forEach(([nr, nc]) => {
                  const nIdF = `front-${nr}-${nc}`;
                  const nIdB = `back-${nr}-${nc}`;
                  if (indexMap.has(nIdF) && indexMap.has(nIdB)) {
                    const p1 = indexMap.get(id), p2 = indexMap.get(backId);
                    const p3 = indexMap.get(nIdF), p4 = indexMap.get(nIdB);
                    idxs.push(p1, p3, p2, p2, p3, p4);
                  }
                });
            }
          }
        }
      }
    });

    return { particles: p, joints: j, indices: new Uint32Array(idxs) };
  }, [type, spacing]);

  useEffect(() => { setReady(true); }, []);

  useFrame(() => {
    if (!geomRef.current || !ready) return;
    const posAttr = geomRef.current.attributes.position;
    particles.forEach((p, i) => {
      const body = particleMap.current.get(p.id);
      if (body) {
        const t = body.translation();
        posAttr.setXYZ(i, t.x - initialPosition.x, t.y - initialPosition.y, t.z - initialPosition.z);
      }
    });
    posAttr.needsUpdate = true;
    geomRef.current.computeVertexNormals();
  });

  return (
    <group position={[initialPosition.x, initialPosition.y, initialPosition.z]}>
      <mesh frustumCulled={false}>
        <bufferGeometry ref={geomRef}>
          <bufferAttribute attach="attributes-position" count={particles.length} array={new Float32Array(particles.length * 3)} itemSize={3} />
          <bufferAttribute attach="index" count={indices.length} array={indices} itemSize={1} />
        </bufferGeometry>
        <meshStandardMaterial color={color} side={DoubleSide} flatShading={false} />
      </mesh>

      {particles.map((p) => (
        <RigidBody
          key={p.id}
          ref={(api) => api ? particleMap.current.set(p.id, api) : particleMap.current.delete(p.id)}
          type={p.pinned ? "fixed" : "dynamic"}
          position={[p.c * spacing - (grid.cols * spacing) / 2, -p.r * spacing, p.z]}
          colliders="ball"
          restitution={0.1}
          friction={0.5}
        >
          <mesh>
            <sphereGeometry args={[particleRadius]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        </RigidBody>
      ))}

      {ready && joints.map((joint) => (
        <PhysicsJoint
          key={joint.id}
          bodyA={{ current: particleMap.current.get(joint.a) }}
          bodyB={{ current: particleMap.current.get(joint.b) }}
          anchorA={joint.anchorA}
          anchorB={joint.anchorB}
        />
      ))}
    </group>
  );
}