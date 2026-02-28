const neo4j = require('neo4j-driver');

// Thay đổi mật khẩu neo4j của bạn ở đây
const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', '12345678') 
);

module.exports = driver;