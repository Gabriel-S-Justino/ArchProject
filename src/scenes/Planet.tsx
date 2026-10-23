// A textured planet (NASA Blue Marble / USGS Viking MDIM, public/textures), oriented by its IAU
// pole and prime meridian at a given date and lit only by the scene's sun light (no environment
// fill, so the night side stays dark). The Earth gets a thin atmospheric rim. The parent places it.
import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, type Ref } from 'react'
import * as THREE from 'three'
import type { Body } from '@/physics/ephemeris'
import { bodyBasis } from './solarScale'

export const PLANET_TEXTURE: Record<Body, string> = {
  earth: `${import.meta.env.BASE_URL}textures/earth_bluemarble_4k.jpg`,
  mars: `${import.meta.env.BASE_URL}textures/mars_viking_4k.jpg`,
}

const rimVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`
const rimFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform vec3 uSun;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <logdepthbuf_fragment>
  float f = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 4.0);
  float lit = smoothstep(-0.25, 0.4, dot(normalize(vN), uSun));
  float a = f * lit;
  gl_FragColor = vec4(uColor * a, a);
}
`

export interface PlanetProps {
  body: Body
  /** Drawn radius, scene units. */
  radius: number
  /** Date for the planet's rotation (JD). */
  orientJd: number
  /** Unit vector towards the Sun in world space, for the Earth's rim (updated by the parent). */
  sunDir?: THREE.Vector3
  ref?: Ref<THREE.Group>
  segments?: number
}

export function Planet({ body, radius, orientJd, sunDir, ref, segments = 64 }: PlanetProps) {
  const map = useTexture(PLANET_TEXTURE[body])
  const material = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, envMapIntensity: 0 })
  }, [map])
  const rim = useMemo(
    () =>
      body === 'earth'
        ? new THREE.ShaderMaterial({
            vertexShader: rimVertex,
            fragmentShader: rimFragment,
            uniforms: { uColor: { value: new THREE.Color(0.32, 0.55, 1.0) }, uSun: { value: sunDir ?? new THREE.Vector3(1, 0, 0) } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide,
          })
        : null,
    [body, sunDir],
  )
  useEffect(
    () => () => {
      material.dispose()
      rim?.dispose()
    },
    [material, rim],
  )
  const quaternion = useMemo(() => {
    const b = bodyBasis(body, orientJd)
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...b.x), new THREE.Vector3(...b.y), new THREE.Vector3(...b.z))
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [body, orientJd])
  return (
    <group ref={ref}>
      <mesh material={material} quaternion={quaternion} scale={radius}>
        <sphereGeometry args={[1, segments, segments / 2]} />
      </mesh>
      {rim && (
        <mesh material={rim} scale={radius * 1.035}>
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
      )}
    </group>
  )
}
