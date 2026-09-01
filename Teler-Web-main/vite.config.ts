import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_BASE is an optional local-development override. Production secrets
// are read only by Vercel Functions and are never exposed through import.meta.env.
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
