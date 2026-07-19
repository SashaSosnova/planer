/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  server: {
    host: true,
    watch: {
      ignored: ['**/android/**', '**/functions/**', '**/*.apk'],
    },
  },
  build: {
    outDir: 'dist',
  },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
