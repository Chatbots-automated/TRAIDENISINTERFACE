import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          ai: ['@anthropic-ai/sdk'],
          charts: ['recharts'],
          docs: ['docxtemplater', 'pizzip', 'xlsx', 'file-saver'],
          icons: ['lucide-react']
        }
      }
    }
  }
});
