// three.js console routing for the 3D chunk. React Three Fiber 9 still creates a THREE.Clock, which
// three r183+ reports as deprecated on every canvas; that one known library notice is dropped, and
// so are ANGLE's X4122 precision notices (see angleLog.ts); everything else three.js logs goes to the
// console unchanged.
import * as THREE from 'three'
import { onlyD3dPrecisionNotes } from './angleLog'

const IGNORED = ['Clock: This module has been deprecated']

THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (IGNORED.some((s) => message.includes(s))) return
  if (type === 'warn' && onlyD3dPrecisionNotes(message, params)) return
  const fn = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log
  fn(message, ...params)
})
