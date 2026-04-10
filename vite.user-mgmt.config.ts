import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'user-management': path.resolve(__dirname, 'src/renderer/user-mgmt.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  optimizeDeps: {
    include: ['xlsx'],
  },
  server: {
    port: 5174,
  },
});
