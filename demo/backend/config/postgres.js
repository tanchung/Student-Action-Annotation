// backend/config/postgres.js
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'classroom_pg', // Tên database bạn đã tạo ở bước Python
  password: '12345',            // Thay bằng mật khẩu PostgreSQL của bạn
  port: 5432,
});

// Bắt lỗi kết nối
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;