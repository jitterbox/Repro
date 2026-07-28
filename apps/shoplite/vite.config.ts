import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5177,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
