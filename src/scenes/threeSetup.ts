// three.js console routing for the 3D chunk. React Three Fiber 9 still creates a THREE.Clock, which
// three r183+ reports as deprecated on every canvas; that one known library notice is dropped, and
// everything else three.js logs goes to the console unchanged.
import * as THREE from 'three'

const IGNORED = ['Clock: This module has been deprecated']

THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (IGNORED.some((s) => message.includes(s))) return
  const fn = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log
  fn(message, ...params)
})
