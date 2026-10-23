// A planet's orbit as a hairline loop, from points sampled off the JPL Horizons ephemeris.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

export function OrbitLine({ points, color = '#5d636b', opacity = 0.85 }: { points: Float32Array; color?: string; opacity?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(points, 3))
    g.computeBoundingSphere()
    return g
  }, [points])
  const material = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }), [color, opacity])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return <lineLoop geometry={geometry} material={material} />
}
