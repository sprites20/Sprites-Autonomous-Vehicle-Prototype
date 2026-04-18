import * as THREE from "three";
import { UE5VRMRigMap } from "./UE5VRMRigMap.js";

export function remapUE5AnimationToVrm(vrm, asset) {
  console.log(asset.animations);
  const clip = THREE.AnimationClip.findByName(asset.animations, "videoplayback_(1)")?.clone();
  if (!clip) {
    throw new Error("Animation clip 'UE5Animation' not found.");
  }

  const tracks = [];

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();
  const _vec3 = new THREE.Vector3();

  const ue5HipsName = "hips_JNT";
  const motionHipsHeight = asset.getObjectByName(ue5HipsName).position.y;
  const vrmHipsY = vrm.humanoid
    ?.getNormalizedBoneNode("hips")
    .getWorldPosition(_vec3).y;
  const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    const trackSplitted = track.name.split(".");
    const ue5RigName = trackSplitted[0];
    const vrmBoneName = UE5VRMRigMap[ue5RigName];
    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    const ue5RigNode = asset.getObjectByName(ue5RigName);

    if (vrmNodeName != null && ue5RigNode) {
      const propertyName = trackSplitted[1];

      // Store rest pose
      ue5RigNode.getWorldQuaternion(restRotationInverse).invert();
      ue5RigNode.parent?.getWorldQuaternion(parentRestWorldRotation);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        for (let i = 0; i < track.values.length; i += 4) {
          const flatQuaternion = track.values.slice(i, i + 4);
          _quatA.fromArray(flatQuaternion);
          _quatA
            .premultiply(parentRestWorldRotation)
            .multiply(restRotationInverse);
          _quatA.toArray(flatQuaternion);
          flatQuaternion.forEach((v, index) => {
            track.values[index + i] = v;
          });
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            track.values.map((v, i) =>
              vrm.meta?.metaVersion === "0" && i % 2 === 0 ? -v : v
            )
          )
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const value = track.values.map(
          (v, i) =>
            (vrm.meta?.metaVersion === "0" && i % 3 !== 1 ? -v : v) *
            hipsPositionScale
        );
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            value
          )
        );
      }
    }
  });

  return new THREE.AnimationClip("vrmAnimation", clip.duration, tracks);
}
