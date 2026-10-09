'use strict';

const WEBHOOK_PATHS = {
  GET_PRODUCTS: '/webhook/91307d0b-16c6-4de5-b349-ea274dd9259d',
  GET_PRICES: '/webhook/60d19a37-65b1-492f-ad35-3bbb474f3cd9',
  GET_MULTIPLIER: '/webhook/77887f94-dfa2-48fe-8b13-8798b693a55a',
};

const NOT_FOUND_BODY = { code: 0, message: 'No item to return was found' };

function loadConfig(env = process.env) {
  return {
    mysql: {
      host: String(env.MYSQL_HOST || '127.0.0.1').trim(),
      port: Number(env.MYSQL_PORT || 3306),
      user: String(env.MYSQL_USER || '').trim(),
      password: String(env.MYSQL_PASSWORD || ''),
      database: String(env.MYSQL_DATABASE || 'hnv').trim(),
    },
    port: Number(env.PORT || 3100),
    webhookPaths: WEBHOOK_PATHS,
    notFoundBody: NOT_FOUND_BODY,
  };
}

module.exports = {
  WEBHOOK_PATHS,
  NOT_FOUND_BODY,
  loadConfig,
};
