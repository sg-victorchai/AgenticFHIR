import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/smartapp',
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Proxy FHIR API requests to avoid CORS issues
      '/fhir-proxy': {
        target: 'http://hapi.fhir.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fhir-proxy/, '/baseR5'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
