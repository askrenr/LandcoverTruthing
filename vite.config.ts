/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/LandcoverTruthing/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
  },
})
