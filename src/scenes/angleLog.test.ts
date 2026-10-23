import { describe, expect, it } from 'vitest'
import { onlyD3dPrecisionNotes } from './angleLog'

// three.js r18x: warn('WebGLProgram: Program Info Log:', programLog) → message 'THREE.WebGLProgram:
// Program Info Log:', params [programLog].
const MSG = 'THREE.WebGLProgram: Program Info Log:'
const X4122 =
  'C:\\fakepath(152,17-42): warning X4122: sum of 1 and 1.17549e-38 cannot be represented accurately in double precision'

describe('onlyD3dPrecisionNotes', () => {
  it('drops a program info log made only of X4122 warnings', () => {
    expect(onlyD3dPrecisionNotes(MSG, [X4122])).toBe(true)
    expect(onlyD3dPrecisionNotes(MSG, [`${X4122}\n${X4122}`])).toBe(true)
  })

  it('ignores blank, whitespace-only and NUL-only lines between and around the warnings', () => {
    expect(onlyD3dPrecisionNotes(MSG, [`\n${X4122}\r\n\0\n  \t\n${X4122}\n\0\0`])).toBe(true)
    expect(onlyD3dPrecisionNotes(MSG, [`${X4122}\n \0 \n`])).toBe(true)
  })

  it('keeps the warning when the log says anything else', () => {
    expect(onlyD3dPrecisionNotes(MSG, [`${X4122}\nwarning X3557: loop only executes for 1 iteration(s)`])).toBe(false)
    expect(onlyD3dPrecisionNotes(MSG, ['error X3004: undeclared identifier'])).toBe(false)
  })

  it('keeps an empty or blank-only log and any other three.js message', () => {
    expect(onlyD3dPrecisionNotes(MSG, [''])).toBe(false)
    expect(onlyD3dPrecisionNotes(MSG, ['\0\n \n'])).toBe(false)
    expect(onlyD3dPrecisionNotes('THREE.WebGLRenderer: Context Lost.', [X4122])).toBe(false)
    expect(onlyD3dPrecisionNotes(X4122, [])).toBe(false)
  })
})
