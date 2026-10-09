'use strict';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateTime(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
}

function formatDecimal(value, fractionDigits) {
  if (value == null) return value;
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toFixed(fractionDigits);
}

function formatProductRow(row) {
  return {
    id: row.id,
    productgroupid: row.productgroupid,
    productcode: row.productcode,
    productdescription: row.productdescription,
    units: row.units,
    created: formatDateTime(row.created),
    updated: formatDateTime(row.updated),
  };
}

function formatPriceRow(row) {
  return {
    id: row.id,
    productid: row.productid,
    price: formatDecimal(row.price, 2),
    created: formatDateTime(row.created),
  };
}

function formatMultiplierRow(row) {
  return {
    id: row.id,
    value: formatDecimal(row.value, 3),
    created: formatDateTime(row.created),
  };
}

module.exports = {
  formatDateTime,
  formatDecimal,
  formatProductRow,
  formatPriceRow,
  formatMultiplierRow,
};
