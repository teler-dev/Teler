import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Note: VITE_API_BASE / VITE_API_TOKEN are read through import.meta.env in
// services/apiConfig.ts — Vite exposes VITE_-prefixed vars automatically, so
// they need no `define` entry here.
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
