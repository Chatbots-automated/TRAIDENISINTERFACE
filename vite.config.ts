import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    fs: {
      allow: ['..']
    },
    // Ensure proper MIME types for ONNX files
    middlewareMode: false,
  },
  assetsInclude: ['**/*.onnx'],
  define: {
    global: 'globalThis',
  },
  // Optimize for WebAssembly and large files
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'transformers': ['@xenova/transformers']
        }
      }
    }
  }
});
