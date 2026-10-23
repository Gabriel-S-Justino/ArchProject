// Whether this browser can draw the 3D scenes (three.js needs WebGL 2). Checked once, with a
// throwaway context that is released immediately. Main-bundle code: no three.js import here.
import { useState } from 'react'

let cached: boolean | undefined

export function hasWebGL2(): boolean {
  if (cached !== undefined) return cached
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    cached = gl !== null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

export function useWebGL2(): boolean {
  const [ok] = useState(() => (typeof document === 'undefined' ? false : hasWebGL2()))
  return ok
}
