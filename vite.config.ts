/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Chunks of the app build. The data files and the big libraries the first screen needs get chunks
 * of their own, so the app's own code stays small and each piece caches separately; the 3D
 * libraries stay out of these groups and load lazily with the first 3D view (SceneSlot.tsx).
 * Imports are unchanged: Node and Vitest read the same modules, so no physics result can differ.
 */
function chunkOf(id: string): string | undefined {
  const p = id.replace(/\\/g, '/')
  if (/\/src\/data\/generated\/ephemeris-/.test(p)) return 'data-ephemeris'
  if (/\/src\/data\/generated\//.test(p)) return 'data-events'
  // three.js on its own (lazy, with the first 3D view); its bindings and helpers split with the scenes.
  if (/\/node_modules\/three\//.test(p)) return 'vendor-three'
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(p)) return 'vendor-react'
  if (/\/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(p)) return 'vendor-motion'
  if (/\/node_modules\/(radix-ui|@radix-ui|lucide-react|cn|class-variance-authority|clsx|tailwind-merge|d3-[a-z]+|internmap)\//.test(p))
    return 'vendor-ui'
  return undefined
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: chunkOf },
    },
    // three.js is one ES module (≈ 770 kB minified, 200 kB gzip) that cannot be split further; it
    // is the lazy chunk loaded with the first 3D view, never part of the first screen. Every other
    // chunk is well under the default 500 kB.
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
