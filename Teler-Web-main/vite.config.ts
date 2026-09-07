import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './scripts/local-api';

const buildId = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.VERCEL_DEPLOYMENT_ID
  || `local-${Date.now()}`;

export default defineConfig(({ mode, command }) => {
  if (command === 'serve') {
    const env = loadEnv(mode, process.cwd(), '');
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('TELER_') || key === 'OPENROUTER_API_KEY') process.env[key] ??= value;
    }
  }
  return {
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
  plugins: [
    react(),
    localApi(buildId),
    {
      name: 'teler-build-version',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        });
      },
    },
  ],
  define: {
    __TELER_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  };
});
