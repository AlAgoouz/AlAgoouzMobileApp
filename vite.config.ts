import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    'import.meta.env.VITE_AGOUZ_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VITE_AGOUZ_RELEASE ?? ''),
  },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
