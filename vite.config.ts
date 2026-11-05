import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this app from /mosaic-builder/, not the domain root.
  // The deploy workflow sets BASE_PATH; local dev and builds stay at /.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    open: true,
  },
  preview: {
    open: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
