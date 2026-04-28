import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const llamaParseKey = env.LLAMAPARSE_API_KEY || env.VITE_LLAMAPARSE_API_KEY || '';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      proxy: {
        '/api/llamacloud': {
          target: 'https://api.cloud.llamaindex.ai',
          changeOrigin: true,
          secure: true,
          rewrite: path => path.replace(/^\/api\/llamacloud/, ''),
          configure: proxy => {
            proxy.on('proxyReq', proxyReq => {
              if (llamaParseKey) {
                proxyReq.setHeader('Authorization', `Bearer ${llamaParseKey}`);
              }
            });
          },
        },
      },
    },
    define: {
      global: 'globalThis',
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
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
  };
});
