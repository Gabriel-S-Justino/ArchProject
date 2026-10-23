import { useEffect, useState } from 'react'

/**
 * `value` once it has stopped changing for `ms`. For live regions fed by something that runs (the
 * mission clock in time warp): screen readers hear where it stopped, not every frame on the way.
 */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(value, settled)) return
    const id = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(id)
  }, [value, settled, ms])
  return settled
}
