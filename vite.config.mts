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
    outDir: '../dist'
  }
})
