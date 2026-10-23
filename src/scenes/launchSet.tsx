// The launch scene's set: the pad (tower, mount, masts on a concrete apron), the sky dome that
// darkens with altitude and shows the stars, and the Earth backdrop seen from high up. Moved out of
// LaunchScene.tsx unchanged; LaunchScene drives them each frame.
import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { rand } from './Exhaust'
import { latticeTowerGeometry, launchMountGeometry, mastsGeometry } from './structures'

/** Height of the pad surface, m (the stack's base is at y = 0). */
export const GROUND_Y = -7
/** The Earth drawn in metres at 1/1000 scale: same angular size as the real Earth. */
export const EARTH_R = 6371

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------------------------
// Pad

export function Pad({ height, radius }: { height: number; radius: number }) {
  const towerH = Math.round((height + 10) / 6) * 6
  const geoms = useMemo(
    () => ({
      tower: latticeTowerGeometry(towerH - GROUND_Y, 7, 6),
      mount: launchMountGeometry(Math.max(3, radius + 0.6), -GROUND_Y),
      masts: mastsGeometry(towerH + 40 - GROUND_Y, Math.max(70, height * 1.3)),
    }),
    [towerH, radius, height],
  )
  useEffect(
    () => () => {
      geoms.tower.dispose()
      geoms.mount.dispose()
      geoms.masts.dispose()
    },
    [geoms],
  )
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.75, metalness: 0.35 }), [])
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b3d3f', roughness: 0.96, metalness: 0 }), [])
  const ground = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1d1f', roughness: 1, metalness: 0 }), [])
  useEffect(() => () => [steel, concrete, ground].forEach((m) => m.dispose()), [steel, concrete, ground])
  const towerX = -(radius + 4.5 + 3.5)
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={GROUND_Y} material={ground}>
        <circleGeometry args={[30000, 64]} />
      </mesh>
      <mesh position-y={GROUND_Y + 0.25} material={concrete}>
        <cylinderGeometry args={[70, 78, 0.5, 48]} />
      </mesh>
      <mesh position={[0, GROUND_Y + 0.52, 0]}>
        <boxGeometry args={[Math.max(6, radius * 1.4), 0.06, 150]} />
        <meshStandardMaterial color="#0c0d0e" roughness={1} />
      </mesh>
      <mesh geometry={geoms.mount} material={steel} />
      <mesh geometry={geoms.tower} material={steel} position={[towerX, GROUND_Y, 0]} />
      {/* access arm to the upper stage */}
      <mesh material={steel} position={[towerX / 2, height * 0.72, 0]}>
        <boxGeometry args={[Math.abs(towerX) - radius - 0.4, 1.4, 2.2]} />
      </mesh>
      <mesh geometry={geoms.masts} material={steel} position-y={GROUND_Y} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Sky: a gradient sphere around the camera, plus stars that appear as the air thins.

export interface SkyHandle {
  update(cam: THREE.Vector3, alt01: number, dip: number): void
}

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const skyFragment = /* glsl */ `
uniform float uAlt;
uniform float uDip;
uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0)) + uDip;
  vec3 zenLow = vec3(0.010, 0.016, 0.028);
  vec3 horLow = vec3(0.093, 0.082, 0.076);
  vec3 zenHigh = vec3(0.0, 0.0, 0.0015);
  vec3 horHigh = vec3(0.03, 0.05, 0.10);
  float spread = mix(0.30, 0.03, uAlt);
  float band = exp(-max(el, 0.0) / spread);
  vec3 col = mix(mix(zenLow, zenHigh, uAlt), mix(horLow, horHigh, uAlt), band);
  float sun = max(dot(d, uSun), 0.0);
  col += mix(vec3(0.20, 0.07, 0.025), vec3(0.06, 0.05, 0.04), uAlt) * pow(sun, 5.0) * band;
  if (el < 0.0) col = mix(mix(horLow, horHigh, uAlt), vec3(0.012, 0.014, 0.016), clamp(-el * 5.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`

export const Sky = function Sky({ ref }: { ref: RefObject<SkyHandle | null> }) {
  const sphere = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: { uAlt: { value: 0 }, uDip: { value: 0 }, uSun: { value: new THREE.Vector3(-0.82, 0.08, -0.56).normalize() } },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )
  const starGeom = useMemo(() => {
    const n = 1400
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = rand(i, 11) * 2 - 1
      const th = rand(i, 12) * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      pos.set([Math.cos(th) * r * 14000, u * 14000, Math.sin(th) * r * 14000], i * 3)
      const b = 0.25 + 0.75 * Math.pow(rand(i, 13), 3)
      col.set([b * 0.92, b * 0.95, b], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  const starMat = useMemo(
    () => new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false, fog: false }),
    [],
  )
  useEffect(() => () => [mat, starGeom, starMat].forEach((x) => x.dispose()), [mat, starGeom, starMat])
  useEffect(() => {
    ref.current = {
      update(cam, alt01, dip) {
        sphere.current?.position.copy(cam)
        stars.current?.position.copy(cam)
        mat.uniforms.uAlt!.value = alt01
        mat.uniforms.uDip!.value = dip
        const v = smooth(0.45, 0.85, alt01)
        starMat.color.setScalar(v)
        if (stars.current) stars.current.visible = v > 0.01
      },
    }
  }, [ref, mat, starMat])
  return (
    <>
      <mesh ref={sphere} material={mat} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[15000, 32, 16]} />
      </mesh>
      <points ref={stars} geometry={starGeom} material={starMat} renderOrder={-9} frustumCulled={false} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Earth backdrop (NASA Blue Marble, public/textures), drawn at 1/1000 scale around the camera.

const earthVertex = /* glsl */ `
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const earthFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun;
uniform float uHaze;
uniform vec3 uHazeColor;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  vec3 day = texture2D(uMap, vUv).rgb;
  float lit = smoothstep(-0.1, 0.35, l);
  vec3 col = day * (0.015 + 0.7 * lit);
  float fres = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 7.0);
  col += vec3(0.10, 0.22, 0.55) * fres * (0.15 + 0.85 * smoothstep(-0.25, 0.4, l));
  col = mix(col, uHazeColor, uHaze);
  gl_FragColor = vec4(col, 1.0);
}
`

export const EarthBackdrop = function EarthBackdrop({ ref }: { ref: RefObject<THREE.Mesh | null> }) {
  const map = useTexture(`${import.meta.env.BASE_URL}textures/earth_bluemarble_4k.jpg`)
  const mat = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    return new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: {
        uMap: { value: map },
        uSun: { value: new THREE.Vector3(-0.3, 0.55, 0.78).normalize() },
        uHaze: { value: 1 },
        uHazeColor: { value: new THREE.Color() },
      },
      depthWrite: false,
      depthTest: false,
    })
  }, [map])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh ref={ref} material={mat} renderOrder={-8} frustumCulled={false} visible={false}>
      <sphereGeometry args={[EARTH_R, 96, 64]} />
    </mesh>
  )
}
