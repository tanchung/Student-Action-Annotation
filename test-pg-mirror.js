/**
 * PHASE 1 INTEGRATION TEST
 * Test PostgreSQL Mirror Service
 * 
 * Run: node test-pg-mirror.js (from d:\KLTN1 root)
 */

const pgPool = require('./demo/backend/config/postgres');
const PGMirrorService = require('./demo/backend/services/pgMirrorService');

async function runTests() {
    console.log('\n🧪 Starting PostgreSQL Mirror Service Tests...\n');

    try {
        // Test 1: Database Connection
        console.log('Test 1: Database Connection');
        const result = await pgPool.query('SELECT NOW()');
        console.log('✅ Connected to PostgreSQL:', result.rows[0]);

        // Test 2: Check if tables exist
        console.log('\nTest 2: Checking if tables exist');
        const tables = await pgPool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        console.log('✅ Tables found:');
        tables.rows.forEach(row => console.log('   -', row.table_name));

        // Test 3: Check table structure
        console.log('\nTest 3: Table Structure');
        
        const mediaAssets = await pgPool.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'media_assets'
            ORDER BY ordinal_position
        `);
        console.log('✅ media_assets columns:');
        mediaAssets.rows.forEach(row => console.log(`   - ${row.column_name}: ${row.data_type}`));

        const captions = await pgPool.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'captions'
            ORDER BY ordinal_position
        `);
        console.log('✅ captions columns:');
        captions.rows.forEach(row => console.log(`   - ${row.column_name}: ${row.data_type}`));

        // Test 4: Test Mirror Service Functions
        console.log('\nTest 4: Mirror Service Functions');
        
        // Create test data
        const testMediaDoc = {
            _id: { toString: () => '507f1f77bcf86cd799439011' },
            clip_name: 'Test Video',
            uploader_id: { toString: () => 'user-123' }
        };

        console.log('Testing mirrorMediaAsset...');
        await PGMirrorService.mirrorMediaAsset(testMediaDoc, 'video');

        // Verify it was inserted
        const inserted = await pgPool.query(
            'SELECT * FROM media_assets WHERE mongo_id = $1',
            ['507f1f77bcf86cd799439011']
        );
        if (inserted.rows.length > 0) {
            console.log('✅ Media asset mirrored successfully:', inserted.rows[0]);
        } else {
            console.log('⚠️ Media asset not found after mirror');
        }

        // Test 5: Check data counts in each table
        console.log('\nTest 5: Current Data Counts');
        const tables_to_check = [
            'users', 'media_assets', 'segments', 'persons_catalog',
            'objects_catalog', 'activities_catalog', 'interactions', 'captions'
        ];
        
        for (const table of tables_to_check) {
            const count = await pgPool.query(`SELECT COUNT(*) as cnt FROM ${table}`);
            console.log(`   ${table}: ${count.rows[0].cnt} rows`);
        }

        console.log('\n✅ All tests completed successfully!\n');

    } catch (err) {
        console.error('❌ Test failed:', err.message);
        console.error(err.stack);
    } finally {
        await pgPool.end();
    }
}

runTests();
