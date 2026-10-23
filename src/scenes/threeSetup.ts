// three.js console routing for the 3D chunk. React Three Fiber 9 still creates a THREE.Clock, which
// three r183+ reports as deprecated on every canvas; that one known library notice is dropped, and
// everything else three.js logs goes to the console unchanged.
import * as THREE from 'three'

const IGNORED = ['Clock: This module has been deprecated']

/**
 * ANGLE's Direct3D shader compiler reports harmless float-precision notices (warning X4122) in the
 * program info log, which three.js forwards as warnings. Dropped only when they are all the log says.
 */
function onlyD3dPrecisionNotes(message: string, params: unknown[]): boolean {
  if (!message.includes('Program Info Log')) return false
  const text = [message, ...params.map(String)].join(String.fromCharCode(10))
  const lines = text
    .replace(/^[^]*?Program Info Log:?/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return lines.length > 0 && lines.every((l) => /warning X4122/.test(l))
}

THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (IGNORED.some((s) => message.includes(s))) return
  if (type === 'warn' && onlyD3dPrecisionNotes(message, params)) return
  const fn = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log
  fn(message, ...params)
})
