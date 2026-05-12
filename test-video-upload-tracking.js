#!/usr/bin/env node
/**
 * Test Video Upload & Track Data Changes
 * Captures MongoDB, PostgreSQL, and Neo4j data at each step
 */

const mongoose = require('mongoose');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

const reportFile = path.join(__dirname, 'VIDEO_UPLOAD_TEST_REPORT.md');
let report = '';

function log(message) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${message}`;
  console.log(msg);
  report += msg + '\n';
}

function logSection(title) {
  const sep = '='.repeat(100);
  console.log('\n' + sep);
  console.log(`  ${title}`);
  console.log(sep);
  report += `\n${sep}\n  ${title}\n${sep}\n`;
}

// ============================================================
// DATA SNAPSHOT
// ============================================================
class DataSnapshot {
  constructor(name) {
    this.name = name;
    this.timestamp = new Date().toISOString();
    this.mongodb = {};
    this.postgresql = {};
    this.neo4j = {};
  }

  async capture(mongoDb, pgPool, neo4jDriver) {
    logSection(`📸 Capturing Snapshot: ${this.name}`);
    
    // MongoDB
    const collections = ['video', 'segment', 'person', 'entity_object', 'activity', 'interaction', 'caption'];
    for (const col of collections) {
      try {
        this.mongodb[col] = await mongoDb.collection(col).countDocuments();
      } catch {
        this.mongodb[col] = 0;
      }
    }
    
    // PostgreSQL
    const tables = ['media_assets', 'segments', 'persons_catalog', 'objects_catalog', 'activities_catalog', 'interactions', 'captions'];
    for (const table of tables) {
      try {
        const result = await pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
        this.postgresql[table] = parseInt(result.rows[0].count);
      } catch {
        this.postgresql[table] = 0;
      }
    }
    
    // Neo4j
    const session = neo4jDriver.session();
    try {
      const labels = ['Video', 'Segment', 'Person', 'Activity', 'EntityObject', 'Caption'];
      for (const label of labels) {
        try {
          const result = await session.run(`MATCH (n:${label}) RETURN count(n) as count`);
          this.neo4j[label] = result.records[0].get('count').toNumber();
        } catch {
          this.neo4j[label] = 0;
        }
      }
      
      // Relationships
      const relResult = await session.run(`MATCH ()-[r]->() RETURN type(r) as type, count(*) as count`);
      this.neo4j['relationships'] = {};
      for (const record of relResult.records) {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        this.neo4j['relationships'][type] = count;
      }
    } finally {
      await session.close();
    }
    
    this.logSummary();
  }

  logSummary() {
    log(`\n✅ ${this.name} Snapshot Captured\n`);
    
    log(`**MongoDB Collections:**`);
    for (const [col, count] of Object.entries(this.mongodb)) {
      log(`  - ${col}: ${count}`);
    }
    
    log(`\n**PostgreSQL Tables:**`);
    for (const [table, count] of Object.entries(this.postgresql)) {
      log(`  - ${table}: ${count}`);
    }
    
    log(`\n**Neo4j Nodes:**`);
    for (const [label, count] of Object.entries(this.neo4j)) {
      if (label !== 'relationships') {
        log(`  - ${label}: ${count}`);
      }
    }
    
    if (this.neo4j.relationships && Object.keys(this.neo4j.relationships).length > 0) {
      log(`\n**Neo4j Relationships:**`);
      for (const [type, count] of Object.entries(this.neo4j.relationships)) {
        log(`  - ${type}: ${count}`);
      }
    }
  }

  diff(previousSnapshot) {
    logSection('📊 DATA CHANGES DETECTED');
    
    log(`\n**MongoDB Changes:**`);
    let mongoChanged = false;
    for (const [col, count] of Object.entries(this.mongodb)) {
      const prev = previousSnapshot.mongodb[col] || 0;
      if (count !== prev) {
        mongoChanged = true;
        log(`  - ${col}: ${prev} → ${count} (${count - prev > 0 ? '+' : ''}${count - prev})`);
      }
    }
    if (!mongoChanged) log(`  (no changes)`);
    
    log(`\n**PostgreSQL Changes:**`);
    let pgChanged = false;
    for (const [table, count] of Object.entries(this.postgresql)) {
      const prev = previousSnapshot.postgresql[table] || 0;
      if (count !== prev) {
        pgChanged = true;
        log(`  - ${table}: ${prev} → ${count} (${count - prev > 0 ? '+' : ''}${count - prev})`);
      }
    }
    if (!pgChanged) log(`  (no changes)`);
    
    log(`\n**Neo4j Changes:**`);
    let neo4jChanged = false;
    for (const [label, count] of Object.entries(this.neo4j)) {
      if (label !== 'relationships') {
        const prev = previousSnapshot.neo4j[label] || 0;
        if (count !== prev) {
          neo4jChanged = true;
          log(`  - ${label}: ${prev} → ${count} (${count - prev > 0 ? '+' : ''}${count - prev})`);
        }
      }
    }
    
    if (this.neo4j.relationships) {
      for (const [type, count] of Object.entries(this.neo4j.relationships)) {
        const prev = previousSnapshot.neo4j.relationships?.[type] || 0;
        if (count !== prev) {
          neo4jChanged = true;
          log(`  - ${type}: ${prev} → ${count} (${count - prev > 0 ? '+' : ''}${count - prev})`);
        }
      }
    }
    if (!neo4jChanged) log(`  (no changes)`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  let mongoDb, pgPool, neo4jDriver;
  
  try {
    logSection('🎥 VIDEO UPLOAD TEST - Data Tracking');
    
    log(`\nℹ️  This script will capture database snapshots before and after video upload`);
    log(`⏱️  Timestamp: ${new Date().toISOString()}`);
    
    // Connect to databases
    log(`\nConnecting to databases...`);
    await mongoose.connect(MONGO_URI);
    mongoDb = mongoose.connection.db;
    log(`✅ MongoDB connected`);
    
    pgPool = new Pool(PG_CONFIG);
    const testConn = await pgPool.connect();
    await testConn.query('SELECT 1');
    testConn.release();
    log(`✅ PostgreSQL connected`);
    
    neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    await neo4jDriver.verifyConnectivity();
    log(`✅ Neo4j connected`);
    
    // Capture initial state
    const beforeSnapshot = new DataSnapshot('BEFORE VIDEO UPLOAD');
    await beforeSnapshot.capture(mongoDb, pgPool, neo4jDriver);
    
    // Instructions
    logSection('📋 NEXT STEPS');
    log(`\n1. Open http://localhost:3000 in browser`);
    log(`2. Upload a test video from frontend`);
    log(`3. Wait for processing to complete (watch backend logs)`);
    log(`4. Once complete, press ENTER to capture after-state`);
    log(`\n⏳ Waiting for you to upload video...`);
    
    // Wait for user input
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    log(`\n⏳ Giving system time to process...`);
    await new Promise(r => setTimeout(r, 5000));
    
    // Capture after state
    const afterSnapshot = new DataSnapshot('AFTER VIDEO UPLOAD');
    await afterSnapshot.capture(mongoDb, pgPool, neo4jDriver);
    
    // Show differences
    afterSnapshot.diff(beforeSnapshot);
    
    // Detailed report
    logSection('📄 DETAILED DATA REPORT');
    
    log(`\n**MongoDB - Video Collection Sample:**`);
    const videoSample = await mongoDb.collection('video').findOne({});
    if (videoSample) {
      log(`  _id: ${videoSample._id}`);
      log(`  video_name: ${videoSample.video_name}`);
      log(`  status: ${videoSample.status}`);
      log(`  processed_at: ${videoSample.processed_at || 'N/A'}`);
      log(`  minio_url: ${videoSample.minio_url ? '✓' : 'N/A'}`);
      log(`  pg_id: ${videoSample.pg_id || 'N/A'}`);
    }
    
    log(`\n**PostgreSQL - media_assets Sample:**`);
    try {
      const pgSample = await pgPool.query('SELECT * FROM media_assets ORDER BY id DESC LIMIT 1');
      if (pgSample.rows.length > 0) {
        const row = pgSample.rows[0];
        log(`  id: ${row.id}`);
        log(`  type: ${row.type}`);
        log(`  name: ${row.name}`);
        log(`  mongo_id: ${row.mongo_id}`);
      }
    } catch (e) {
      log(`  ⚠️ Table may not exist yet`);
    }
    
    log(`\n**Neo4j - Video Node Sample:**`);
    const session = neo4jDriver.session();
    try {
      const result = await session.run('MATCH (v:Video) RETURN v LIMIT 1');
      if (result.records.length > 0) {
        const node = result.records[0].get('v');
        log(`  mongo_id: ${node.properties.mongo_id}`);
        log(`  name: ${node.properties.name}`);
        log(`  status: ${node.properties.status}`);
      }
    } finally {
      await session.close();
    }
    
    logSection('✅ TEST COMPLETE');
    log(`\nReport saved to: ${reportFile}`);
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    if (mongoDb) await mongoose.disconnect();
    if (pgPool) await pgPool.end();
    if (neo4jDriver) await neo4jDriver.close();
    
    fs.writeFileSync(reportFile, report);
    process.exit(0);
  }
}

main();
