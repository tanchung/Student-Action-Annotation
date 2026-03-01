const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'classroom_pg',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '12345',
});

// Bắt lỗi kết nối
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;