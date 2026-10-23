/// <reference lib="webworker" />
// Computes the porkchop grid off the main thread. Protocol: in `{ spec }` (PorkchopRequest),
// out a PorkchopGrid with its two Float32Arrays transferred, not copied. A throw (bad spec)
// surfaces as an `error` event on the Worker. Typed by tsconfig.worker.json (WebWorker lib).
import { computePorkchop } from './porkchop'
import type { PorkchopRequest } from './porkchop'

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<PorkchopRequest>) => {
  const grid = computePorkchop(event.data.spec)
  scope.postMessage(grid, [grid.c3.buffer, grid.vInf.buffer])
}
