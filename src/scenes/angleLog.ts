// Recognises the one harmless shader-compiler notice the 3D chunk drops from the console: ANGLE's
// Direct3D compiler reports float-precision notices (warning X4122) in the program info log, and
// three.js forwards that log as a warning. Pure, so it is unit-tested without a GPU.

/** Blank lines in ANGLE's log can hold NUL characters, which String.prototype.trim() keeps. */
const BLANK = /^[\s\0]*$/

/**
 * True only for three.js's "Program Info Log" warning whose log consists solely of X4122 lines
 * (blank or NUL-only lines aside). Anything else in the log keeps the whole warning visible.
 */
export function onlyD3dPrecisionNotes(message: string, params: readonly unknown[]): boolean {
  if (!message.includes('Program Info Log')) return false
  const text = [message, ...params.map(String)].join('\n')
  const lines = text
    .replace(/^[^]*?Program Info Log:?/, '')
    .split(/\r?\n/)
    .filter((l) => !BLANK.test(l))
  return lines.length > 0 && lines.every((l) => /warning X4122/.test(l))
}
