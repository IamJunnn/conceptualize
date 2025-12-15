import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  publicDir: 'public',
  server: {
    port: 5173
  },
  build: {
    outDir: '../dist',
    minify: 'esbuild',
  },
  esbuild: {
    // Remove console.log in production builds
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})
