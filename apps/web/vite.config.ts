import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, normalizePath } from 'vite'

const storageDir = normalizePath(path.resolve(import.meta.dirname, '../../storage'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    strictPort: true,
    origin: 'http://localhost:5173',
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', `${storageDir}/**`] },
  },
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        admin: path.resolve(import.meta.dirname, 'src/admin/main.tsx'),
        video: path.resolve(import.meta.dirname, 'src/video/main.tsx'),
      },
      output: {
        manualChunks: (id) => /\/packages\/shared\/src\/i18n\/(fi|sv|nb|da|de|en)\.ts$/u.exec(id)?.[1],
      },
    },
  },
})
