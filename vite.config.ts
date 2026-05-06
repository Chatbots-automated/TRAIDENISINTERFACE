import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: import('http').ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const llamaParseKey = env.LLAMAPARSE_API_KEY || env.VITE_LLAMAPARSE_API_KEY || '';
  const directusUrl = (env.DIRECTUS_URL || env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org').trim().replace(/\/$/, '');
  const directusToken = (env.DIRECTUS_TOKEN || env.VITE_DIRECTUS_TOKEN || '').trim();

  return {
    plugins: [
      react(),
      {
        name: 'traidenis-local-llamacloud-directus-upload',
        configureServer(server) {
          server.middlewares.use('/api/llamacloud/directus-file-upload', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { message: 'Method not allowed.' });
              return;
            }
            if (!llamaParseKey || !directusToken) {
              sendJson(res, 500, { message: 'Trūksta API konfigūracijos dokumento paruošimui.' });
              return;
            }

            try {
              const payload = await readJsonBody(req);
              const fileId = String(payload.directus_file_id || '').trim();
              if (!fileId || fileId.includes('/') || fileId.includes('..')) {
                sendJson(res, 400, { message: 'Trūksta Directus failo ID.' });
                return;
              }

              const metaRes = await fetch(`${directusUrl}/files/${encodeURIComponent(fileId)}`, {
                headers: { authorization: `Bearer ${directusToken}`, accept: 'application/json' },
              });
              if (!metaRes.ok) {
                sendJson(res, metaRes.status, { message: 'Directus failas nerastas arba nepasiekiamas.' });
                return;
              }
              const metaJson = await metaRes.json();
              const meta = metaJson?.data || {};
              const fileName = meta.filename_download || meta.title || payload.file_name || 'document';
              const mimeType = meta.type || payload.file_type || 'application/octet-stream';

              const assetRes = await fetch(`${directusUrl}/assets/${encodeURIComponent(fileId)}?download`, {
                headers: { authorization: `Bearer ${directusToken}` },
              });
              if (!assetRes.ok) {
                sendJson(res, assetRes.status, { message: 'Directus failas nerastas arba nepasiekiamas.' });
                return;
              }

              const bytes = await assetRes.arrayBuffer();
              const form = new FormData();
              form.append('file', new Blob([bytes], { type: mimeType }), fileName);
              form.append('purpose', 'parse');

              const uploadRes = await fetch('https://api.cloud.llamaindex.ai/api/v1/beta/files', {
                method: 'POST',
                headers: { authorization: `Bearer ${llamaParseKey}`, accept: 'application/json' },
                body: form,
              });
              const text = await uploadRes.text();
              res.statusCode = uploadRes.status;
              res.setHeader('content-type', uploadRes.headers.get('content-type') || 'application/json');
              res.setHeader('cache-control', 'no-store');
              res.end(text);
            } catch (error) {
              sendJson(res, 502, {
                message: error instanceof Error ? error.message : 'Dokumento paruošti nepavyko.',
              });
            }
          });
        },
      },
    ],
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
            proxy.on('proxyRes', proxyRes => {
              const location = proxyRes.headers.location;
              if (typeof location === 'string' && location.startsWith('https://api.cloud.llamaindex.ai')) {
                proxyRes.headers.location = location.replace('https://api.cloud.llamaindex.ai', '/api/llamacloud');
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
