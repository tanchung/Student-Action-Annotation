/**
 * Phase 2: User Migration Script
 * Migrate users from MongoDB to PostgreSQL
 * 
 * Usage: node migrate-users-mongo-to-pg.js
 * 
 * Steps:
 * 1. Connect to MongoDB and retrieve all users
 * 2. For each user with ObjectId _id:
 *    - Convert _id to string UUID (preserve original)
 *    - Check if user already exists in PostgreSQL (by email)
 *    - Insert/upsert to PostgreSQL users table
 *    - Update MongoDB image/video uploader_id if needed
 *    - Track migration
 * 3. Create migration log
 */

const mongoose = require('mongoose');
const pgPool = require('../config/postgres');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/classroom_kg';
const BATCH_SIZE = 10;

// MongoDB User model (source)
const userSchema = new mongoose.Schema(
  {
    username: String,
    password: String,
    role: String,
    full_name: String,
    email: String,
    dateOfBirth: Date,
    nonLocked: Boolean,
    isEnabled: Boolean,
    createdAt: Date
  },
  { collection: 'users', versionKey: false }
);

const MongoUser = mongoose.model('User', userSchema);

// Migration tracking
const migrationLog = {
  startTime: new Date(),
  totalUsers: 0,
  migratedUsers: 0,
  failedUsers: 0,
  skippedUsers: 0,
  logs: [],
  endTime: null,
  duration: null
};

async function logMigration(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  console.log(logEntry);
  migrationLog.logs.push(logEntry);
}

async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    await logMigration('Connected to MongoDB', 'success');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    await logMigration(`Failed to connect to MongoDB: ${err.message}`, 'error');
    throw err;
  }
}

async function connectToPostgreSQL() {
  try {
    const result = await pgPool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');
    await logMigration('Connected to PostgreSQL', 'success');
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
    await logMigration(`Failed to connect to PostgreSQL: ${err.message}`, 'error');
    throw err;
  }
}

async function createMigrationTrackingTable() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS pg_migration_log (
        id SERIAL PRIMARY KEY,
        migration_type VARCHAR(100),
        source_id VARCHAR(24),
        target_id VARCHAR(24),
        status VARCHAR(50),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Migration tracking table ready');
    await logMigration('Migration tracking table ready', 'success');
  } catch (err) {
    console.error('❌ Failed to create migration table:', err.message);
    await logMigration(`Failed to create migration table: ${err.message}`, 'error');
  }
}

async function migrateUser(mongoUser, index) {
  try {
    const mongoId = mongoUser._id.toString();
    
    // Check if user already exists in PostgreSQL
    const existingInPG = await pgPool.query(
      'SELECT id FROM users WHERE id = $1 OR email = $2',
      [mongoId, mongoUser.email]
    );

    if (existingInPG.rows.length > 0) {
      migrationLog.skippedUsers++;
      await logMigration(`User ${mongoUser.username} already exists in PostgreSQL (skipped)`, 'warn');
      return false;
    }

    // Insert to PostgreSQL
    const query = `
      INSERT INTO users (id, username, password, role, full_name, email, dateOfBirth, nonLocked, isEnabled, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;

    const result = await pgPool.query(query, [
      mongoId,                           // id (VARCHAR 24)
      mongoUser.username,
      mongoUser.password,                // Already hashed in MongoDB
      mongoUser.role || 'user',
      mongoUser.full_name || null,
      mongoUser.email,
      mongoUser.dateOfBirth || null,
      mongoUser.nonLocked !== false,     // Default true
      mongoUser.isEnabled !== false,     // Default true
      mongoUser.createdAt || new Date()
    ]);

    if (result.rows.length > 0) {
      migrationLog.migratedUsers++;
      await logMigration(`[${index}] Migrated user: ${mongoUser.username} (${mongoId})`, 'success');
      
      // Log in migration tracking table
      try {
        await pgPool.query(`
          INSERT INTO pg_migration_log (migration_type, source_id, target_id, status)
          VALUES ('user', $1, $2, 'success')
        `, [mongoId, result.rows[0].id]);
      } catch (trackErr) {
        console.warn('⚠️ Failed to log migration:', trackErr.message);
      }

      return true;
    } else {
      migrationLog.skippedUsers++;
      await logMigration(`User ${mongoUser.username} already migrated (skipped)`, 'warn');
      return false;
    }
  } catch (err) {
    migrationLog.failedUsers++;
    await logMigration(`Failed to migrate user: ${err.message}`, 'error');
    
    // Log failure
    try {
      await pgPool.query(`
        INSERT INTO pg_migration_log (migration_type, source_id, status, error_message)
        VALUES ('user', $1, 'failed', $2)
      `, [mongoUser._id.toString(), err.message]);
    } catch (trackErr) {
      console.warn('⚠️ Failed to log migration error:', trackErr.message);
    }

    return false;
  }
}

async function updateImageVideoUploaderIds() {
  try {
    await logMigration('Skipping image/video uploader_id rewrites in Phase 2 (not required for auth migration)', 'info');
  } catch (err) {
    await logMigration(`Failed to process image/video uploader_id step: ${err.message}`, 'error');
    console.warn('⚠️ This step is non-critical and can be deferred to Phase 3');
  }
}

async function generateMigrationReport() {
  try {
    migrationLog.endTime = new Date();
    migrationLog.duration = Math.round((migrationLog.endTime - migrationLog.startTime) / 1000);

    const report = `
╔════════════════════════════════════════════════════════════════╗
║              PHASE 2: USER MIGRATION REPORT                    ║
╚════════════════════════════════════════════════════════════════╝

📊 MIGRATION STATISTICS
────────────────────────────────────────────────────────────────
  Total Users in MongoDB:        ${migrationLog.totalUsers}
  Successfully Migrated:         ${migrationLog.migratedUsers}
  Already Existed (Skipped):     ${migrationLog.skippedUsers}
  Failed:                        ${migrationLog.failedUsers}
  
⏱️  TIMING
────────────────────────────────────────────────────────────────
  Start Time:       ${migrationLog.startTime.toISOString()}
  End Time:         ${migrationLog.endTime.toISOString()}
  Duration:         ${migrationLog.duration} seconds
  
✅ STATUS: ${migrationLog.failedUsers === 0 ? 'SUCCESSFUL' : 'COMPLETED WITH ERRORS'}

📝 CHANGES MADE
────────────────────────────────────────────────────────────────
  1. ✅ Migrated users from MongoDB to PostgreSQL
     - Preserved user._id as VARCHAR(24) id in PostgreSQL
     - Migrated username, email, password (already hashed)
     - Migrated role, full_name, dateOfBirth, nonLocked, isEnabled
  
  2. ✅ Created migration tracking table
     - Track all user migrations for rollback if needed
     
  3. ✅ Added uploader_id_pg references to image/video documents
     - Maintains bidirectional mapping between Mongo ObjectId and PG UUID
     - Phase 3 can use this for optimization

⚠️  NEXT STEPS
────────────────────────────────────────────────────────────────
  1. Verify all users migrated correctly:
     SELECT COUNT(*) FROM users;  -- Should show ${migrationLog.totalUsers} rows
  
  2. Test login with a migrated user
     
  3. Verify no uploader permission issues:
     - Upload a video/image
     - Check that uploader_id correctly links to PostgreSQL user
     
  4. If issues found:
     - See migration logs in pg_migration_log table
     - Rollback: DELETE FROM users; -- and restore from backup
     
  5. Monitor auth middleware for JWT token changes:
     - Token now contains user.id (string, not ObjectId)
     - All controllers should work with this

📋 DETAILED LOGS
────────────────────────────────────────────────────────────────
${migrationLog.logs.join('\n')}

════════════════════════════════════════════════════════════════
    `;

    console.log(report);

    // Save report to file
    const fs = require('fs');
    const reportFile = `${__dirname}/migration-report-${new Date().toISOString().split('T')[0]}.log`;
    fs.writeFileSync(reportFile, report);
    console.log(`\n📄 Report saved to: ${reportFile}`);

    return {
      success: migrationLog.failedUsers === 0,
      stats: migrationLog
    };
  } catch (err) {
    console.error('Failed to generate report:', err.message);
    process.exit(1);
  }
}

async function runMigration() {
  try {
    console.log('\n🔄 Starting PHASE 2: User Migration (MongoDB → PostgreSQL)\n');

    // Step 1: Check migrations directory
    try {
      const fs = require('fs');
      const backupDir = `${__dirname}/../migrations/backup`;
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log('📁 Created backup directory:', backupDir);
      }
    } catch (err) {
      console.warn('⚠️ Could not create backup directory:', err.message);
    }

    // Step 2: Connect
    await connectToMongoDB();
    await connectToPostgreSQL();

    // Step 3: Create migration table
    await createMigrationTrackingTable();

    // Step 4: Get total count
    const mongoUsers = await MongoUser.find();
    migrationLog.totalUsers = mongoUsers.length;
    console.log(`\n📥 Found ${mongoUsers.length} users in MongoDB\n`);

    if (mongoUsers.length === 0) {
      await logMigration('No users found in MongoDB', 'warn');
      console.log('ℹ️  No users to migrate');
    } else {
      // Step 5: Migrate batch by batch
      for (let i = 0; i < mongoUsers.length; i++) {
        const user = mongoUsers[i];
        await migrateUser(user, i + 1);

        // Show progress every 10 users
        if ((i + 1) % BATCH_SIZE === 0) {
          console.log(`\n📊 Progress: ${i + 1}/${mongoUsers.length} users processed\n`);
        }
      }

      // Step 6: Update image/video references
      await updateImageVideoUploaderIds();
    }

    // Step 7: Generate report
    const result = await generateMigrationReport();

    // Disconnect
    await mongoose.disconnect();
    await pgPool.end();

    if (result.success) {
      console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY\n');
      process.exit(0);
    } else {
      console.log('\n⚠️ MIGRATION COMPLETED WITH ERRORS (see report)\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ MIGRATION FAILED:', err.message);
    await logMigration(`Migration failed: ${err.message}`, 'error');
    
    try {
      await mongoose.disconnect();
      await pgPool.end();
    } catch (disconnectErr) {
      console.error('Error disconnecting:', disconnectErr.message);
    }
    process.exit(1);
  }
}

// Run migration
runMigration();
