'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

const { WEBHOOK_PATHS, NOT_FOUND_BODY } = require('../src/config');
const { createServer } = require('../src/server');

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          if (raw) {
            try {
              json = JSON.parse(raw);
            } catch {
              json = raw;
            }
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function createMockPool(responses) {
  return {
    async execute(sql, params = []) {
      const key = `${sql}::${JSON.stringify(params)}`;
      if (!Object.prototype.hasOwnProperty.call(responses, key)) {
        throw new Error(`Unexpected query: ${key}`);
      }
      return responses[key];
    },
  };
}

async function run() {
  const mockPool = createMockPool({
    [`SELECT id, productgroupid, productcode, productdescription, units, created, updated FROM products WHERE productcode = ? LIMIT 1::["MISSING"]`]: [[]],
    [`SELECT id, productgroupid, productcode, productdescription, units, created, updated FROM products WHERE productcode = ? LIMIT 1::["ABC123"]`]: [[{
      id: 1,
      productgroupid: 2,
      productcode: 'ABC123',
      productdescription: 'Test product',
      units: 'vnt',
      created: '2025-09-10 15:28:58',
      updated: '2025-09-10 15:28:58',
    }]],
    [`SELECT id, productid, price, created FROM prices WHERE id = ? LIMIT 1::[1]`]: [[{
      id: 1,
      productid: 1,
      price: '12170.00',
      created: '2025-09-10 15:28:58',
    }]],
    [`SELECT id, value, created FROM pricemulti ORDER BY created DESC LIMIT 1::[]`]: [[{
      id: 17,
      value: '1.000',
      created: '2026-05-15 09:53:41',
    }]],
  });

  const server = createServer({
    pool: mockPool,
    config: {
      port: 0,
      webhookPaths: WEBHOOK_PATHS,
      notFoundBody: NOT_FOUND_BODY,
      mysql: {},
    },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const health = await request(port, 'GET', '/health');
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.body, { ok: true, service: 'catalog-api' });
    assert.equal(health.headers['access-control-allow-origin'], '*');

    const options = await request(port, 'OPTIONS', WEBHOOK_PATHS.GET_PRODUCTS);
    assert.equal(options.statusCode, 204);
    assert.equal(options.headers['access-control-allow-origin'], '*');

    const missingProduct = await request(port, 'POST', WEBHOOK_PATHS.GET_PRODUCTS, {
      product_code: 'MISSING',
    });
    assert.equal(missingProduct.statusCode, 500);
    assert.deepEqual(missingProduct.body, NOT_FOUND_BODY);

    const product = await request(port, 'POST', WEBHOOK_PATHS.GET_PRODUCTS, {
      product_code: 'ABC123',
    });
    assert.equal(product.statusCode, 200);
    assert.equal(product.body.productcode, 'ABC123');

    const price = await request(port, 'POST', WEBHOOK_PATHS.GET_PRICES, { id: 1 });
    assert.equal(price.statusCode, 200);
    assert.deepEqual(price.body, {
      id: 1,
      productid: 1,
      price: '12170.00',
      created: '2025-09-10 15:28:58',
    });

    const multiplier = await request(port, 'POST', WEBHOOK_PATHS.GET_MULTIPLIER, {});
    assert.equal(multiplier.statusCode, 200);
    assert.deepEqual(multiplier.body, {
      id: 17,
      value: '1.000',
      created: '2026-05-15 09:53:41',
    });

    const unknown = await request(port, 'POST', '/webhook/unknown', {});
    assert.equal(unknown.statusCode, 404);

    console.log('catalog-api tests passed');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
