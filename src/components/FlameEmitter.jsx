import * as THREE from 'three'
import React, { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'
import fireTexture from './flame.png' // Ensure this is correctly loaded via Vite/Webpack

const _VS = `
uniform float pointMultiplier;
attribute float size;
attribute float angle;
attribute vec4 colour;
varying vec4 vColour;
varying vec2 vAngle;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size * pointMultiplier / gl_Position.w;
  vAngle = vec2(cos(angle), sin(angle));
  vColour = colour;
}`

const _FS = `
uniform sampler2D diffuseTexture;
varying vec4 vColour;
varying vec2 vAngle;
void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
  gl_FragColor = texture2D(diffuseTexture, coords) * vColour;
}`

const ParticleMaterial = shaderMaterial(
  {
    diffuseTexture: new THREE.TextureLoader().load(fireTexture),
    pointMultiplier: 0,
  },
  _VS,
  _FS,
  (self) => {
    self.transparent = true
    self.vertexColors = true
    self.blending = THREE.AdditiveBlending
    self.depthTest = true
    self.depthWrite = false
  }
)

class LinearSpline {
  constructor(lerp) {
    this.points = []
    this.lerp = lerp
  }
  addPoint(t, d) {
    this.points.push([t, d])
  }
  get(t) {
    let p1 = 0
    for (let i = 0; i < this.points.length; i++) {
      if (this.points[i][0] >= t) break
      p1 = i
    }
    const p2 = Math.min(this.points.length - 1, p1 + 1)
    if (p1 === p2) return this.points[p1][1]
    return this.lerp(
      (t - this.points[p1][0]) / (this.points[p2][0] - this.points[p1][0]),
      this.points[p1][1],
      this.points[p2][1]
    )
  }
}

export function FlameEmitter({ position = [0, 0, 0], count = 5000 }) {
  const pointsRef = useRef()
  const { camera, size } = useThree()

  const particles = useRef([])

  const alphaSpline = useMemo(() => {
    const s = new LinearSpline((t, a, b) => a + t * (b - a))
    s.addPoint(0.0, 0.0)
    s.addPoint(0.1, 1.0)
    s.addPoint(0.6, 1.0)
    s.addPoint(1.0, 0.0)
    return s
  }, [])

  const colourSpline = useMemo(() => {
    const s = new LinearSpline((t, a, b) => a.clone().lerp(b, t))
    s.addPoint(0.0, new THREE.Color(0xffff80))
    s.addPoint(1.0, new THREE.Color(0xff8080))
    return s
  }, [])

  const sizeSpline = useMemo(() => {
    const s = new LinearSpline((t, a, b) => a + t * (b - a))
    s.addPoint(0.0, 1.0)
    s.addPoint(0.5, 5.0)
    s.addPoint(1.0, 1.0)
    return s
  }, [])

  const geometry = useMemo(() => new THREE.BufferGeometry(), [])

  const material = useMemo(() => {
    const mat = new ParticleMaterial()
    mat.uniforms.pointMultiplier.value =
      size.height / (2.0 * Math.tan((0.5 * Math.PI * 60.0) / 180.0))
    return mat
  }, [size])
  useEffect(() => {
    // Initialize geometry
    geometry.computeBoundingSphere(); // Or set it manually if you know the max spread
    if (geometry.boundingSphere) {
      geometry.boundingSphere.radius = 5; // Adjust this value based on your particle spread
    }
  }, [geometry]);
  useFrame((_, delta) => {
    const pArray = particles.current

    for (let i = 0; i < 50 && pArray.length < count; i++) {
      const life = (Math.random() * 0.75 + 0.25) * 2.0
      pArray.push({
        position: new THREE.Vector3(
          (Math.random() * 2 - 1) * 0.2,
          0,
          (Math.random() * 2 - 1) * 0.2
        ),
        size: (Math.random() * 0.5 + 0.5) * 0.2,
        colour: new THREE.Color(),
        alpha: 1.0,
        life: life,
        maxLife: life,
        rotation: Math.random() * 2 * Math.PI,
        velocity: new THREE.Vector3(0, 1, 0),
      })
    }

    const positions = []
    const sizes = []
    const colours = []
    const angles = []

    for (let i = 0; i < pArray.length; i++) {
      const p = pArray[i]
      p.life -= delta
      if (p.life <= 0) {
        pArray.splice(i, 1)
        i--
        continue
      }

      const t = 1 - p.life / p.maxLife
      p.rotation += delta * 0.5
      p.alpha = alphaSpline.get(t)
      p.currentSize = p.size * sizeSpline.get(t)
      p.colour.copy(colourSpline.get(t))
      p.position.add(p.velocity.clone().multiplyScalar(delta))

      positions.push(
        p.position.x + position[0],
        p.position.y + position[1],
        p.position.z + position[2]
      )
      sizes.push(p.currentSize)
      colours.push(p.colour.r, p.colour.g, p.colour.b, p.alpha)
      angles.push(p.rotation)
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
    geometry.setAttribute('colour', new THREE.Float32BufferAttribute(colours, 4))
    geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1))

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.size.needsUpdate = true
    geometry.attributes.colour.needsUpdate = true
    geometry.attributes.angle.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}
