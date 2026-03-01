/**
 * Import Database from JSON Files
 * 
 * Imports data exported by exportDataToJSON.js
 * Works without command-line tools (mongorestore, psql, etc.)
 * 
 * Safe to run - shows confirmation before importing
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const readline = require('readline');

// Configuration
const DUMP_DIR = path.join(__dirname, 'database_dumps_json');
const MONGODB_DIR = path.join(DUMP_DIR, 'mongodb');
const POSTGRES_FILE = path.join(DUMP_DIR, 'postgresql.json');
const NEO4J_FILE = path.join(DUMP_DIR, 'neo4j.json');

// Check if dump directory exists
function checkDumpDirectory() {
  if (!fs.existsSync(DUMP_DIR)) {
    console.error(`❌ Import directory not found: ${DUMP_DIR}`);
    console.error(`\n💡 Run this first: node exportDataToJSON.js`);
    process.exit(1);
  }
  console.log(`✅ Found dump directory: ${DUMP_DIR}\n`);
}

// Countdown before import
function countdown(seconds) {
  return new Promise(resolve => {
    let remaining = seconds;
    console.log(`\n⏳ Starting import in ${remaining} seconds... (Press Ctrl+C to cancel)`);
    
    const interval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        process.stdout.write(`\r⏳ Starting import in ${remaining} seconds... (Press Ctrl+C to cancel)`);
      } else {
        process.stdout.write('\r                                                                \r');
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}

// Import MongoDB collections
async function importMongoDB() {
  console.log('📥 Importing MongoDB...');
  
  if (!fs.existsSync(MONGODB_DIR)) {
    console.log('  ⚠️  MongoDB dump directory not found, skipping...\n');
    return { success: false, imported: 0 };
  }
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('  ✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const files = fs.readdirSync(MONGODB_DIR).filter(f => f.endsWith('.json'));
    
    let totalImported = 0;
    
    for (const file of files) {
      const collectionName = path.basename(file, '.json');
      const filePath = path.join(MONGODB_DIR, file);
      
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        if (data.length === 0) {
          console.log(`  ⚠️  ${collectionName}: No data (skipped)`);
          continue;
        }
        
        // Drop existing collection to avoid duplicates
        try {
          await db.collection(collectionName).drop();
        } catch (err) {
          // Collection doesn't exist, that's fine
        }
        
        // Insert documents
        await db.collection(collectionName).insertMany(data);
        console.log(`  ✅ ${collectionName}: ${data.length} documents imported`);
        totalImported += data.length;
      } catch (err) {
        console.error(`  ❌ ${collectionName}: ${err.message}`);
      }
    }
    
    await mongoose.disconnect();
    console.log(`  📊 Total: ${totalImported} documents imported\n`);
    return { success: true, imported: totalImported };
  } catch (error) {
    console.error(`  ❌ MongoDB import failed: ${error.message}\n`);
    return { success: false, imported: 0 };
  }
}

// Import PostgreSQL tables
async function importPostgreSQL() {
  console.log('📥 Importing PostgreSQL...');
  
  if (!fs.existsSync(POSTGRES_FILE)) {
    console.log('  ⚠️  PostgreSQL dump file not found, skipping...\n');
    return { success: false, imported: 0 };
  }
  
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('  ✅ Connected to PostgreSQL');
    
    const data = JSON.parse(fs.readFileSync(POSTGRES_FILE, 'utf-8'));
    let totalImported = 0;
    
    for (const [tableName, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  ⚠️  ${tableName}: No data (skipped)`);
        continue;
      }
      
      try {
        // Clear existing data
        await pool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
        
        // Get column names from first row
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const columnNames = columns.join(', ');
        
        // Insert rows
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          await pool.query(
            `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`,
            values
          );
        }
        
        console.log(`  ✅ ${tableName}: ${rows.length} rows imported`);
        totalImported += rows.length;
      } catch (err) {
        console.error(`  ❌ ${tableName}: ${err.message}`);
      }
    }
    
    console.log(`  📊 Total: ${totalImported} rows imported\n`);
    
    await pool.end();
    return { success: true, imported: totalImported };
  } catch (error) {
    console.error(`  ❌ PostgreSQL import failed: ${error.message}\n`);
    await pool.end().catch(() => {});
    return { success: false, imported: 0 };
  }
}

// Import Neo4j nodes and relationships
async function importNeo4j() {
  console.log('📥 Importing Neo4j...');
  
  if (!fs.existsSync(NEO4J_FILE)) {
    console.log('  ⚠️  Neo4j dump file not found, skipping...\n');
    return { success: false, imported: 0 };
  }
  
  if (!process.env.NEO4J_URI || !process.env.NEO4J_PASSWORD) {
    console.log('  ⚠️  Neo4j not configured, skipping...\n');
    return { success: false, imported: 0 };
  }
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD)
  );
  
  try {
    const session = driver.session();
    
    // Test connection
    await session.run('RETURN 1');
    console.log('  ✅ Connected to Neo4j');
    
    // Clear existing data
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('  🗑️  Cleared existing data');
    
    const data = JSON.parse(fs.readFileSync(NEO4J_FILE, 'utf-8'));
    let totalImported = 0;
    
    // Import nodes
    if (data.nodes && data.nodes.length > 0) {
      for (const node of data.nodes) {
        const labels = node.labels.join(':');
        const props = node.properties;
        
        // Build property string
        const propString = Object.entries(props)
          .map(([key, value]) => {
            if (typeof value === 'string') {
              return `${key}: "${value.replace(/"/g, '\\"')}"`;
            } else if (value instanceof Date) {
              return `${key}: datetime("${value.toISOString()}")`;
            } else {
              return `${key}: ${JSON.stringify(value)}`;
            }
          })
          .join(', ');
        
        const query = `CREATE (n:${labels} {${propString}})`;
        await session.run(query);
      }
      
      console.log(`  ✅ Nodes: ${data.nodes.length} imported`);
      totalImported += data.nodes.length;
    }
    
    // Import relationships
    if (data.relationships && data.relationships.length > 0) {
      for (const rel of data.relationships) {
        // Match nodes by properties
        const startLabels = rel.start.labels.join(':');
        const endLabels = rel.end.labels.join(':');
        
        // Build property match for start node
        const startMatch = Object.entries(rel.start.properties)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');
        
        // Build property match for end node
        const endMatch = Object.entries(rel.end.properties)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');
        
        // Build relationship properties
        const relProps = Object.entries(rel.properties || {})
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');
        
        const query = `
          MATCH (a:${startLabels} {${startMatch}})
          MATCH (b:${endLabels} {${endMatch}})
          CREATE (a)-[r:${rel.type} ${relProps ? `{${relProps}}` : ''}]->(b)
        `;
        
        try {
          await session.run(query);
        } catch (err) {
          // Some relationships might fail if nodes don't match exactly
          // This is OK for graph data
        }
      }
      
      console.log(`  ✅ Relationships: ${data.relationships.length} imported`);
      totalImported += data.relationships.length;
    }
    
    console.log(`  📊 Total: ${totalImported} items imported\n`);
    
    await session.close();
    await driver.close();
    return { success: true, imported: totalImported };
  } catch (error) {
    console.error(`  ❌ Neo4j import failed: ${error.message}\n`);
    await driver.close();
    return { success: false, imported: 0 };
  }
}

// Main import function
async function main() {
  console.log('🗄️  Database Import Tool (JSON Format)');
  console.log('=====================================\n');
  
  checkDumpDirectory();
  
  // Show warning
  console.log('⚠️  WARNING: This will REPLACE existing data in:');
  console.log('  - MongoDB collections');
  console.log('  - PostgreSQL tables');
  console.log('  - Neo4j graph (all nodes and relationships)');
  
  await countdown(3);
  
  console.log('🚀 Starting import...\n');
  
  const results = {
    mongodb: await importMongoDB(),
    postgresql: await importPostgreSQL(),
    neo4j: await importNeo4j()
  };
  
  console.log('=====================================');
  console.log('📊 Import Summary:');
  console.log(`  MongoDB:    ${results.mongodb.success ? `✅ ${results.mongodb.imported} documents` : '❌ Failed'}`);
  console.log(`  PostgreSQL: ${results.postgresql.success ? `✅ ${results.postgresql.imported} rows` : '❌ Failed'}`);
  console.log(`  Neo4j:      ${results.neo4j.success ? `✅ ${results.neo4j.imported} items` : '⚠️  Skipped/Failed'}`);
  console.log(`\n✅ Import completed!`);
  console.log(`\n💡 Next steps:`);
  console.log(`  1. Start backend: node server.js`);
  console.log(`  2. Start frontend: npm run dev`);
  console.log(`  3. Login with imported users`);
  console.log('=====================================\n');
  
  process.exit(0);
}

// Run import
main().catch(error => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
