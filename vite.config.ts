import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    'import.meta.env.VITE_AGOUZ_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VITE_AGOUZ_RELEASE ?? ''),
    'import.meta.env.VITE_AGOUZ_ENVIRONMENT': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {'/api': 'http://127.0.0.1:8093'},
  }
});
