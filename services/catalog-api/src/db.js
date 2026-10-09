'use strict';

const mysql = require('mysql2/promise');

function createPool(mysqlConfig) {
  return mysql.createPool({
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    waitForConnections: true,
    connectionLimit: 5,
    decimalNumbers: false,
    dateStrings: true,
  });
}

module.exports = { createPool };
