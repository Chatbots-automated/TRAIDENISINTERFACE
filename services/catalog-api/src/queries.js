'use strict';

const {
  formatProductRow,
  formatPriceRow,
  formatMultiplierRow,
} = require('./format');

async function getProductByCode(pool, productCode) {
  const [rows] = await pool.execute(
    'SELECT id, productgroupid, productcode, productdescription, units, created, updated FROM products WHERE productcode = ? LIMIT 1',
    [productCode],
  );
  return rows[0] ? formatProductRow(rows[0]) : null;
}

async function getPriceById(pool, priceId) {
  const [rows] = await pool.execute(
    'SELECT id, productid, price, created FROM prices WHERE id = ? LIMIT 1',
    [priceId],
  );
  return rows[0] ? formatPriceRow(rows[0]) : null;
}

async function getLatestMultiplier(pool) {
  const [rows] = await pool.execute(
    'SELECT id, value, created FROM pricemulti ORDER BY created DESC LIMIT 1',
  );
  return rows[0] ? formatMultiplierRow(rows[0]) : null;
}

module.exports = {
  getProductByCode,
  getPriceById,
  getLatestMultiplier,
};
