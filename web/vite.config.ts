import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  // pdfmake CJS olarak dagitildigi icin gelistirme sunucusunda on-paketlenir.
  optimizeDeps: {
    include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'],
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
