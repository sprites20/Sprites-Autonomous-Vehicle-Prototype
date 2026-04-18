// ParticleEmitter.js
import * as THREE from 'three';
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import fireTextureUrl from './flame.png'; // Adjust path based on your project structure

// GLSL Shader Strings (no changes needed, they are already efficient)
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
    // Calculate point size based on perspective, multiplied by the attribute size
    gl_PointSize = size * pointMultiplier / gl_Position.w;
    vAngle = vec2(cos(angle), sin(angle));
    vColour = colour;
}
`;

const _FS = `
uniform sampler2D diffuseTexture;
varying vec4 vColour;
varying vec2 vAngle;
void main() {
    // Rotate texture coordinates
    vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
    gl_FragColor = texture2D(diffuseTexture, coords) * vColour;
}
`;

// Custom Material
const ParticleMaterial = shaderMaterial(
  {
    pointMultiplier: 1,
    diffuseTexture: new THREE.TextureLoader().load(fireTextureUrl),
  },
  _VS,
  _FS
);
extend({ ParticleMaterial });

// --- Particle Behavior Constants (tuned for a flame-like effect) ---
const PARTICLE_LIFETIME_MIN = 1.0; // seconds
const PARTICLE_LIFETIME_MAX = 3.0; // seconds
const PARTICLE_SIZE_MIN = 1.0;
const PARTICLE_SIZE_MAX = 4.0;
const INITIAL_VELOCITY_Y_MIN = 0.5; // Upward velocity for flame
const INITIAL_VELOCITY_Y_MAX = 1.5;
const INITIAL_VELOCITY_XY_MAX = 0.2; // Sideways spread for flame
const INITIAL_SPAWN_SPREAD_RADIUS = 0.1; // How far particles can spawn from the center

// --- Pre-allocated temporary objects for useFrame calculations ---
const _tempParticlePosition = new THREE.Vector3();
const _tempParticleVelocity = new THREE.Vector3();
const _tempColor = new THREE.Color();


export function ParticleEmitter({ position = [0, 0, 0], count = 500 }) {
  const ref = useRef();
  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const particlesData = useRef([]); // Renamed for clarity, stores particle objects
  const { camera, viewport } = useThree();

  // Helper: Linear Interpolation (lerp)
  const lerp = (t, a, b) => a + t * (b - a);

  // Alpha Spline (defines how particle transparency changes over its lifetime)
  const alphaSpline = useMemo(() => [
    [0.0, 0.0], [0.1, 1.0], [0.6, 1.0], [1.0, 0.0]
  ], []); // Memoize to prevent re-creation

  // Function to get alpha value from spline based on normalized time (0 to 1)
  const getAlpha = (t) => {
    for (let i = 0; i < alphaSpline.length - 1; i++) {
      if (t < alphaSpline[i + 1][0]) {
        return lerp(
          (t - alphaSpline[i][0]) / (alphaSpline[i + 1][0] - alphaSpline[i][0]),
          alphaSpline[i][1],
          alphaSpline[i + 1][1]
        );
      }
    }
    return 0; // Should not be reached if t is between 0 and 1
  };

  // Particle Class (for cleaner organization and re-usability)
  // Each particle instance will hold its dynamic properties.
  class Particle {
    constructor() {
      this.position = new THREE.Vector3();
      this.velocity = new THREE.Vector3();
      this.size = 0;
      this.angle = 0;
      this.life = 0;
      this.maxLife = 0;
      this.alpha = 0;
      // No need for a separate `color` instance if all particles have the same base color,
      // as color is set directly to the buffer attribute.
    }

    // Method to reset particle to initial state, emitting from the source
    reset(emitterX, emitterY, emitterZ) {
      this.maxLife = lerp(Math.random(), PARTICLE_LIFETIME_MIN, PARTICLE_LIFETIME_MAX);
      this.life = this.maxLife;

      this.position.set(
        emitterX + (Math.random() - 0.5) * INITIAL_SPAWN_SPREAD_RADIUS * 2,
        emitterY + (Math.random() - 0.5) * INITIAL_SPAWN_SPREAD_RADIUS * 2,
        emitterZ + (Math.random() - 0.5) * INITIAL_SPAWN_SPREAD_RADIUS * 2
      );

      this.velocity.set(
        (Math.random() - 0.5) * INITIAL_VELOCITY_XY_MAX,
        lerp(Math.random(), INITIAL_VELOCITY_Y_MIN, INITIAL_VELOCITY_Y_MAX),
        (Math.random() - 0.5) * INITIAL_VELOCITY_XY_MAX
      );

      this.size = lerp(Math.random(), PARTICLE_SIZE_MIN, PARTICLE_SIZE_MAX);
      this.angle = Math.random() * Math.PI * 2;
      this.alpha = 1; // Start fully opaque (will be adjusted by spline)
    }

    // Method to update particle's state over time
    update(delta) {
      this.life -= delta;
      const t = 1 - this.life / this.maxLife; // Normalized life (0 at start, 1 at end)
      this.alpha = getAlpha(t); // Update alpha based on spline

      // Update position using pre-allocated temp vector
      _tempParticleVelocity.copy(this.velocity).multiplyScalar(delta);
      this.position.add(_tempParticleVelocity);
    }
  }

  // Initialize Particles and Buffer Attributes once on mount
  useEffect(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colours = new Float32Array(count * 4); // RGBA
    const angles = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = new Particle();
      p.reset(position[0], position[1], position[2]); // Reset using emitter's position
      particlesData.current.push(p);

      positions[i * 3 + 0] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;

      sizes[i] = p.size;

      colours[i * 4 + 0] = 1;     // Red
      colours[i * 4 + 1] = 0.8;   // Green
      colours[i * 4 + 2] = 0.5;   // Blue (Base flame color)
      colours[i * 4 + 3] = p.alpha; // Alpha is dynamic

      angles[i] = p.angle;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('colour', new THREE.BufferAttribute(colours, 4));
    geom.setAttribute('angle', new THREE.BufferAttribute(angles, 1));
  }, [geom, count, position]); // Re-initialize if count or position changes

  // Animate particles each frame
  useFrame((state, delta) => {
    // Retrieve attributes directly from geometry
    const positionsAttribute = geom.getAttribute('position');
    const sizesAttribute = geom.getAttribute('size');
    const coloursAttribute = geom.getAttribute('colour');
    const anglesAttribute = geom.getAttribute('angle');

    if (!positionsAttribute || !sizesAttribute || !coloursAttribute || !anglesAttribute) return;

    const positionsArray = positionsAttribute.array;
    const sizesArray = sizesAttribute.array;
    const coloursArray = coloursAttribute.array;
    const anglesArray = anglesAttribute.array;
    
    // Update each particle
    for (let i = 0; i < particlesData.current.length; i++) {
      const p = particlesData.current[i];
      p.update(delta); // Update particle life, alpha, and position

      // If particle life is over, reset it to the emitter's origin
      if (p.life <= 0) {
        p.reset(position[0], position[1], position[2]);
      }

      // Update buffer attributes directly
      positionsArray[i * 3 + 0] = p.position.x;
      positionsArray[i * 3 + 1] = p.position.y;
      positionsArray[i * 3 + 2] = p.position.z;

      sizesArray[i] = p.size; // Size can also be dynamic over life if needed

      // Only update alpha, RGB components remain constant for fire
      coloursArray[i * 4 + 3] = p.alpha;

      anglesArray[i] = p.angle; // Angle can also be dynamic (e.g., rotate)
    }

    // Mark attributes for update on the GPU
    positionsAttribute.needsUpdate = true;
    sizesAttribute.needsUpdate = true;
    coloursAttribute.needsUpdate = true;
    anglesAttribute.needsUpdate = true;

    // Update pointMultiplier uniform based on current camera/viewport
    // This ensures point sizes scale correctly with perspective.
    ref.current.material.uniforms.pointMultiplier.value =
      viewport.height * state.gl.getPixelRatio() / (2.0 * Math.tan(0.5 * THREE.MathUtils.degToRad(camera.fov)));
  });

  return (
    <points ref={ref} geometry={geom}>
      {/* Use the custom particleMaterial, enable transparency, disable depth write for proper blending */}
      <particleMaterial transparent depthWrite={false} vertexColors blending={THREE.AdditiveBlending} />
    </points>
  );
}