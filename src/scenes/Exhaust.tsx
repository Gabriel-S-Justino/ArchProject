// Engine exhaust and pad smoke for the launch scene.
// Plume: an open cone shaped in the vertex shader (it widens as the air thins), additive, with HDR
// colour above the bloom threshold so only the exhaust blooms. Kerolox burns orange-yellow, solids
// near-white, hydrolox a faint blue with shock diamonds, methalox a clearer blue.
// Smoke: one instanced mesh of camera-facing soft discs (one draw call). Every particle's state is a
// pure function of animation time, so replay, skip and still frames are exact.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { Propellant } from '@/game/types'

const PLUME_COLORS: Record<Propellant, { core: string; mid: string; edge: string; gain: number; opacity: number; diamonds: number }> = {
  kerolox: { core: '#fff4dc', mid: '#ffb25a', edge: '#ff6a1f', gain: 4.2, opacity: 1, diamonds: 0.25 },
  solid: { core: '#fffaf0', mid: '#ffd796', edge: '#ff9940', gain: 5, opacity: 1, diamonds: 0 },
  hydrolox: { core: '#eef4ff', mid: '#a8c2ff', edge: '#5f7fd6', gain: 2.6, opacity: 0.4, diamonds: 1.2 },
  methalox: { core: '#f1f4ff', mid: '#93b2ff', edge: '#4a6ad0', gain: 3.4, opacity: 0.75, diamonds: 0.9 },
}

const plumeVertex = /* glsl */ `
uniform float uLength;
uniform float uRadius;
uniform float uSpread;
uniform float uTime;
varying float vU;
varying float vFacing;
varying float vAng;
void main() {
  float u = clamp(0.5 - position.y, 0.0, 1.0);
  float bulge = 1.0 + uSpread * 2.4 * pow(u, 0.55) + 0.35 * pow(u, 0.8);
  float taper = 1.0 - smoothstep(0.5, 1.0, u) * 0.7;
  float r = uRadius * bulge * taper * (0.94 + 0.06 * sin(uTime * 37.0 + u * 23.0));
  vec3 p = vec3(position.x * r, -u * uLength, position.z * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  vU = u;
  vAng = atan(position.z, position.x);
  gl_Position = projectionMatrix * mv;
}
`

const plumeFragment = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;
uniform float uGain;
uniform float uOpacity;
uniform float uDiamonds;
uniform float uTime;
varying float vU;
varying float vFacing;
varying float vAng;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float u = vU;
  float core = pow(vFacing, 2.2);
  float along = pow(1.0 - u, 1.5);
  float flick = 0.7 + 0.6 * noise(vec2(vAng * 3.0, u * 14.0 - uTime * 26.0));
  float diamonds = 1.0 + uDiamonds * pow(abs(sin(u * 3.14159 * 7.0)), 14.0) * (1.0 - u);
  vec3 col = mix(uEdge, uMid, smoothstep(0.0, 0.55, core * along));
  col = mix(col, uCore, smoothstep(0.6, 1.0, core) * clamp(1.0 - u * 1.8, 0.0, 1.0));
  float a = pow(vFacing, 1.25) * along * flick * diamonds * uOpacity;
  gl_FragColor = vec4(col * uGain * a, a);
}
`

export interface PlumeHandle {
  /** 0 = off, 1 = full thrust. */
  throttle: number
  /** 0 at sea level → 1 in vacuum (the plume balloons). */
  spread: number
}

/**
 * An exhaust plume pointing down from local y = 0. `length` and `radius` in metres; drive it every
 * frame through `handle` (no re-render needed).
 */
export function Plume({
  propellant,
  radius,
  length,
  handle,
  position,
}: {
  propellant: Propellant
  radius: number
  length: number
  handle: RefObject<PlumeHandle>
  position?: [number, number, number]
}) {
  const ref = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 32, 28, true), [])
  const material = useMemo(() => {
    const c = PLUME_COLORS[propellant]
    return new THREE.ShaderMaterial({
      vertexShader: plumeVertex,
      fragmentShader: plumeFragment,
      uniforms: {
        uLength: { value: length },
        uRadius: { value: radius },
        uSpread: { value: 0 },
        uTime: { value: 0 },
        uCore: { value: new THREE.Color(c.core) },
        uMid: { value: new THREE.Color(c.mid) },
        uEdge: { value: new THREE.Color(c.edge) },
        uGain: { value: c.gain },
        uOpacity: { value: c.opacity },
        uDiamonds: { value: c.diamonds },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  }, [propellant, length, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useFrame((state) => {
    const m = ref.current
    const h = handle.current
    if (!m || !h) return
    const on = h.throttle > 0.002
    m.visible = on
    if (!on) return
    const u = material.uniforms
    u.uTime!.value = state.clock.elapsedTime
    u.uSpread!.value = h.spread
    const thin = 1 - 0.35 * h.spread
    u.uLength!.value = length * (0.35 + 0.65 * h.throttle) * (1 + h.spread * 0.8)
    u.uRadius!.value = radius * (0.6 + 0.4 * h.throttle)
    u.uOpacity!.value = PLUME_COLORS[propellant].opacity * h.throttle * thin
  })
  return <mesh ref={ref} geometry={geometry} material={material} position={position} frustumCulled={false} renderOrder={5} />
}

// ---------------------------------------------------------------------------------------------
// Smoke

const smokeVertex = /* glsl */ `
attribute float aAlpha;
attribute float aWarm;
attribute float aSeed;
varying vec2 vUv;
varying float vAlpha;
varying float vWarm;
varying float vSeed;
void main() {
  vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = length(instanceMatrix[0].xyz);
  vec4 mv = viewMatrix * center;
  float c = cos(aSeed * 6.283);
  float s = sin(aSeed * 6.283);
  mv.xy += mat2(c, s, -s, c) * position.xy * size;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vAlpha = aAlpha;
  vWarm = aWarm;
  vSeed = aSeed;
}
`

const smokeFragment = /* glsl */ `
uniform vec3 uSmoke;
uniform vec3 uWarm;
varying vec2 vUv;
varying float vAlpha;
varying float vWarm;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 q = vUv - 0.5;
  float d = length(q) * 2.0;
  float n = noise(vUv * 3.5 + vSeed * 17.0) * 0.6 + noise(vUv * 7.0 - vSeed * 5.0) * 0.4;
  float a = smoothstep(1.0, 0.15, d + (n - 0.5) * 0.55) * vAlpha;
  if (a < 0.003) discard;
  float shade = 0.72 + 0.4 * (vUv.y + n * 0.3);
  vec3 col = mix(uSmoke * shade, uWarm, clamp(vWarm, 0.0, 1.0));
  gl_FragColor = vec4(col, a * 0.82);
}
`

export interface SmokeParticle {
  x: number
  y: number
  z: number
  size: number
  alpha: number
  warm: number
}

/**
 * Soft smoke discs. `sample(i, out)` fills particle i for the current frame (pure in time), and is
 * called every frame for every particle.
 */
export function Smoke({
  count,
  sample,
  color = '#6e7276',
  warm = '#ffb070',
}: {
  count: number
  sample: (i: number, out: SmokeParticle) => void
  color?: string
  warm?: string
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const { geometry, material, alpha, warmth } = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    const warmth = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    const seed = new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: count }, (_, i) => fract(Math.sin(i * 91.7) * 4375.5))), 1)
    alpha.setUsage(THREE.DynamicDrawUsage)
    warmth.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aAlpha', alpha)
    g.setAttribute('aWarm', warmth)
    g.setAttribute('aSeed', seed)
    const m = new THREE.ShaderMaterial({
      vertexShader: smokeVertex,
      fragmentShader: smokeFragment,
      uniforms: { uSmoke: { value: new THREE.Color(color) }, uWarm: { value: new THREE.Color(warm) } },
      transparent: true,
      depthWrite: false,
    })
    return { geometry: g, material: m, alpha, warmth }
  }, [count, color, warm])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  const p = useMemo<SmokeParticle>(() => ({ x: 0, y: 0, z: 0, size: 1, alpha: 0, warm: 0 }), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let any = false
    for (let i = 0; i < count; i++) {
      p.alpha = 0
      p.warm = 0
      sample(i, p)
      const s = Math.max(0.001, p.size)
      m4.makeScale(s, s, s).setPosition(p.x, p.y, p.z)
      mesh.setMatrixAt(i, m4)
      alpha.setX(i, p.alpha)
      warmth.setX(i, p.warm)
      if (p.alpha > 0.003) any = true
    }
    mesh.visible = any
    mesh.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    warmth.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} renderOrder={4} />
}

function fract(x: number) {
  return x - Math.floor(x)
}

/** Deterministic pseudo-random number in [0, 1) for particle i and channel k. */
export function rand(i: number, k: number): number {
  return fract(Math.sin(i * 127.1 + k * 311.7) * 43758.5453)
}
