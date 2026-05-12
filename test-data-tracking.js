const mongoose = require('mongoose');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/classroom_kg';
const PG_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'classroom_pg',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
};
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || '12345678';

const reportFile = path.join(__dirname, 'DATA_TRACKING_REPORT.md');
let report = '';

function log(message) {
  console.log(message);
  report += message + '\n';
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
  report += `\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`;
}

// ============================================================
// MONGODB QUERIES
// ============================================================
async function trackMongoDB() {
  logSection('📊 MONGODB DATA');
  
  const db = mongoose.connection.db;
  const collections = ['video', 'segment', 'person', 'entity_object', 'activity', 'interaction', 'caption', 'environment', 'frame'];
  
  for (const collName of collections) {
    try {
      const count = await db.collection(collName).countDocuments();
      log(`\n**${collName}**: ${count} documents`);
      
      if (count > 0) {
        const sample = await db.collection(collName).findOne({});
        if (sample) {
          log(`  Sample fields: ${Object.keys(sample).slice(0, 8).join(', ')}`);
          if (collName === 'video') {
            log(`  - status: ${sample.status}`);
            log(`  - minio_url: ${sample.minio_url ? '✓ exists' : 'N/A'}`);
          }
          if (collName === 'segment') {
            log(`  - segment_index: ${sample.segment_index}`);
            log(`  - caption: ${sample.caption ? `"${sample.caption.substring(0, 50)}..."` : 'N/A'}`);
          }
          if (collName === 'caption') {
            log(`  - caption: "${sample.caption ? sample.caption.substring(0, 50) : 'N/A'}..."`);
            log(`  - caption_scope: ${sample.caption_scope}`);
          }
        }
      }
    } catch (e) {
      log(`  ⚠️ Collection doesn't exist yet`);
    }
  }
}

// ============================================================
// POSTGRESQL QUERIES
// ============================================================
async function trackPostgreSQL(pgPool) {
  logSection('📊 POSTGRESQL DATA');
  
  const tables = ['media_assets', 'segments', 'persons_catalog', 'objects_catalog', 'activities_catalog', 'interactions', 'captions'];
  
  for (const table of tables) {
    try {
      const result = await pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result.rows[0].count;
      log(`\n**${table}**: ${count} rows`);
      
      if (count > 0) {
        const sampleResult = await pgPool.query(`SELECT * FROM ${table} LIMIT 1`);
        if (sampleResult.rows.length > 0) {
          const sample = sampleResult.rows[0];
          log(`  Sample fields: ${Object.keys(sample).slice(0, 6).join(', ')}`);
          if (table === 'media_assets') {
            log(`  - type: ${sample.type}`);
            log(`  - name: ${sample.name}`);
          }
          if (table === 'captions') {
            log(`  - caption_scope: ${sample.caption_scope}`);
            log(`  - caption: "${sample.caption ? sample.caption.substring(0, 50) : 'N/A'}..."`);
          }
        }
      }
    } catch (e) {
      log(`  ⚠️ Table doesn't exist yet: ${e.message}`);
    }
  }
}

// ============================================================
// NEO4J QUERIES
// ============================================================
async function trackNeo4j(driver) {
  logSection('📊 NEO4J DATA');
  
  const session = driver.session();
  try {
    // Count nodes by label
    const nodeLabels = ['Video', 'Segment', 'Person', 'Activity', 'EntityObject', 'Caption', 'CaptionSegment'];
    
    for (const label of nodeLabels) {
      const result = await session.run(`MATCH (n:${label}) RETURN count(n) as count`);
      const count = result.records[0].get('count').toNumber();
      log(`\n**${label}**: ${count} nodes`);
      
      if (count > 0) {
        const sampleResult = await session.run(`MATCH (n:${label}) RETURN n LIMIT 1`);
        if (sampleResult.records.length > 0) {
          const node = sampleResult.records[0].get('n');
          const props = Object.keys(node.properties).slice(0, 4);
          log(`  Properties: ${props.join(', ')}`);
        }
      }
    }
    
    // Count relationships
    log(`\n**Relationships**:`);
    const relResult = await session.run(`MATCH ()-[r]->() RETURN type(r) as type, count(*) as count`);
    const relCounts = {};
    for (const record of relResult.records) {
      const type = record.get('type');
      const count = record.get('count').toNumber();
      relCounts[type] = (relCounts[type] || 0) + count;
    }
    
    for (const [type, count] of Object.entries(relCounts)) {
      log(`  - ${type}: ${count}`);
    }
    
  } finally {
    await session.close();
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  try {
    log('🚀 Starting Data Tracking\n');
    log(`Timestamp: ${new Date().toISOString()}\n`);
    
    // Connect MongoDB
    log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    log('✅ MongoDB connected\n');
    
    // Connect PostgreSQL
    log('Connecting to PostgreSQL...');
    const pgPool = new Pool(PG_CONFIG);
    const pgClient = await pgPool.connect();
    await pgClient.query('SELECT 1');
    pgClient.release();
    log('✅ PostgreSQL connected\n');
    
    // Connect Neo4j
    log('Connecting to Neo4j...');
    const neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    await neo4jDriver.verifyConnectivity();
    log('✅ Neo4j connected\n');
    
    // Track data
    await trackMongoDB();
    await trackPostgreSQL(pgPool);
    await trackNeo4j(neo4jDriver);
    
    logSection('📝 SUMMARY');
    log(`Report generated at: ${new Date().toISOString()}`);
    log(`\nℹ️  To test video upload:`);
    log(`1. Upload video from frontend at http://localhost:3000`);
    log(`2. Wait for processing to complete`);
    log(`3. Run this script again to see data changes`);
    
    // Save report
    fs.writeFileSync(reportFile, report);
    log(`\n✅ Report saved to: ${reportFile}`);
    
    // Cleanup
    await mongoose.disconnect();
    await pgPool.end();
    await neo4jDriver.close();
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
