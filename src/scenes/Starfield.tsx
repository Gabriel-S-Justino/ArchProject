// The sky: NASA SVS Deep Star Maps (J2000 RA/Dec, public/textures/starmap_8k.jpg) on the inside of
// a large sphere. The map has RA 0h at its centre and RA increasing to the left, so the texture is
// mirrored in u; the sphere is then tilted by the obliquity so equatorial J2000 lines up with the
// ecliptic frame the scenes use. Kept dim: it is a backdrop, not the subject.
import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { OBLIQUITY } from './solarScale'

export const STARMAP_URL = `${import.meta.env.BASE_URL}textures/starmap_8k.jpg`

export function Starfield({ radius = 20000, brightness = 0.75 }: { radius?: number; brightness?: number }) {
  const map = useTexture(STARMAP_URL)
  const material = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.repeat.x = -1
    map.offset.x = 1
    map.anisotropy = 8
    map.needsUpdate = true
    return new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, depthWrite: false, fog: false, color: new THREE.Color(brightness, brightness, brightness), toneMapped: false })
  }, [map, brightness])
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh material={material} rotation-x={-OBLIQUITY} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 96, 48]} />
    </mesh>
  )
}
