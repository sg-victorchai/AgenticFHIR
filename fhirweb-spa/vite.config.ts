import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/smartapp',
  plugins: [
    react(),
    {
      name: 'redirect-root',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '') {
            _res.writeHead(302, { Location: '/smartapp' });
            _res.end();
          } else {
            next();
          }
        });
      },
    },
  ],
  server: {
    port: 3000,
    open: '/smartapp',
    proxy: {
      // Proxy FHIR API requests to avoid CORS issues
      '/fhir-proxy': {
        target: 'http://hapi.fhir.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fhir-proxy/, '/baseR5'),
      },
      // Azure FHIR server proxy
      '/fhir-azure': {
        target: 'http://20.212.110.174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fhir-azure/, '/fhir'),
      },
      // Azure Agent/API proxy (for digital-twin, hybrid-search, etc.)
      '/api-azure': {
        target: 'http://20.212.110.174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-azure/, ''),
      },      // Azure SSE/Events stream proxy
      '/events-azure': {
        target: 'http://20.212.110.174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^/events-azure/, '/api/events'),
      },    },
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
