'use strict';

require('dotenv').config();

const http = require('http');
const { loadConfig } = require('./config');
const { createPool } = require('./db');
const { createHandlers } = require('./handlers');

function createServer({ pool, config }) {
  const { handleRequest } = createHandlers({
    pool,
    webhookPaths: config.webhookPaths,
    notFoundBody: config.notFoundBody,
  });

  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    req.url = url.pathname;
    void handleRequest(req, res);
  });
}

function startServer({ pool, config, host = '0.0.0.0' } = {}) {
  const resolvedConfig = config || loadConfig();
  const resolvedPool = pool || createPool(resolvedConfig.mysql);
  const server = createServer({ pool: resolvedPool, config: resolvedConfig });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(resolvedConfig.port, host, () => {
      console.log(`[catalog-api] listening on http://${host}:${resolvedConfig.port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[catalog-api] failed to start:', err);
    process.exit(1);
  });
}

module.exports = { createServer, startServer };
