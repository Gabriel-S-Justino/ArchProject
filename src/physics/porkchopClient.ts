// Main-thread helper that runs computePorkchop in a Web Worker (bundled by Vite through the
// `new URL(..., import.meta.url)` pattern). One short-lived worker per call.
import type { PorkchopGrid, PorkchopRequest, PorkchopSpec } from './porkchop'

export function computePorkchopAsync(spec?: PorkchopSpec): Promise<PorkchopGrid> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./porkchop.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PorkchopGrid>) => {
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate()
      reject(new Error(event.message || 'Porkchop worker failed'))
    }
    const request: PorkchopRequest = { spec }
    worker.postMessage(request)
  })
}
