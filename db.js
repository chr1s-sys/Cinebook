// One shared connection pool for the whole app.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cinebook',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // keep DATETIME as plain 'YYYY-MM-DD HH:MM:SS' text (no timezone surprises)
});

module.exports = pool;
