import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two separate apps, built into dist/:
//   index.html        → the website  (src/website)
//   admin/index.html  → the admin dashboard (src/admin)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: '_app', // keeps built JS/CSS apart from your photos in /assets
    rollupOptions: {
      input: {
        website: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    // During development, API calls go to the Node server (node server.js on port 5500)
    proxy: { '/api': { target: 'http://localhost:5500', changeOrigin: true } },
  },
});
