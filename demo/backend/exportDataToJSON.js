/**
 * Export Database to JSON Files
 * 
 * Alternative export tool that uses Node.js drivers directly
 * instead of command-line tools (mongodump, pg_dump, etc.)
 * 
 * This creates portable JSON files that can be committed to Git
 * and imported on any machine without installing database tools.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');

// Configuration
const DUMP_DIR = path.join(__dirname, 'database_dumps_json');
const MONGODB_DIR = path.join(DUMP_DIR, 'mongodb');
const POSTGRES_FILE = path.join(DUMP_DIR, 'postgresql.json');
const NEO4J_FILE = path.join(DUMP_DIR, 'neo4j.json');

// MongoDB collections to export (tên thật trong database)
const MONGO_COLLECTIONS = [
  'users',
  'video',
  'environment',
  'segment',
  'person',
  'entity_object',
  'activity',
  'interaction',
  'caption'
];

// PostgreSQL tables to export
const POSTGRES_TABLES = [
  'videos',
  'environments',
  'segments',
  'persons',
  'objects',
  'activities',
  'video_person',
  'video_object',
  'video_activity'
];

// Create dump directory
function createDumpDirectory() {
  if (!fs.existsSync(DUMP_DIR)) {
    fs.mkdirSync(DUMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(MONGODB_DIR)) {
    fs.mkdirSync(MONGODB_DIR, { recursive: true });
  }
  console.log(`✅ Created dump directory: ${DUMP_DIR}\n`);
}

// Export MongoDB collections
async function exportMongoDB() {
  console.log('📤 Exporting MongoDB...');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('  ✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    let totalDocuments = 0;
    
    for (const collectionName of MONGO_COLLECTIONS) {
      try {
        const collection = db.collection(collectionName);
        const documents = await collection.find({}).toArray();
        
        if (documents.length > 0) {
          const filePath = path.join(MONGODB_DIR, `${collectionName}.json`);
          fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
          console.log(`  ✅ ${collectionName}: ${documents.length} documents`);
          totalDocuments += documents.length;
        } else {
          console.log(`  ⚠️  ${collectionName}: 0 documents (skipped)`);
        }
      } catch (err) {
        console.log(`  ⚠️  ${collectionName}: Collection not found (skipped)`);
      }
    }
    
    await mongoose.disconnect();
    console.log(`  📊 Total: ${totalDocuments} documents exported\n`);
    return true;
  } catch (error) {
    console.error(`  ❌ MongoDB export failed: ${error.message}\n`);
    return false;
  }
}

// Export PostgreSQL tables
async function exportPostgreSQL() {
  console.log('📤 Exporting PostgreSQL...');
  
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  
  try {
    await pool.query('SELECT 1');
    console.log('  ✅ Connected to PostgreSQL');
    
    const exportData = {};
    let totalRows = 0;
    
    for (const tableName of POSTGRES_TABLES) {
      try {
        const result = await pool.query(`SELECT * FROM ${tableName}`);
        exportData[tableName] = result.rows;
        console.log(`  ✅ ${tableName}: ${result.rows.length} rows`);
        totalRows += result.rows.length;
      } catch (err) {
        console.log(`  ⚠️  ${tableName}: Table not found (skipped)`);
        exportData[tableName] = [];
      }
    }
    
    fs.writeFileSync(POSTGRES_FILE, JSON.stringify(exportData, null, 2));
    console.log(`  📊 Total: ${totalRows} rows exported\n`);
    
    await pool.end();
    return true;
  } catch (error) {
    console.error(`  ❌ PostgreSQL export failed: ${error.message}\n`);
    await pool.end().catch(() => {});
    return false;
  }
}

// Export Neo4j nodes and relationships
async function exportNeo4j() {
  console.log('📤 Exporting Neo4j...');
  
  if (!process.env.NEO4J_URI || !process.env.NEO4J_PASSWORD) {
    console.log('  ⚠️  Neo4j not configured, skipping...\n');
    return false;
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
    
    // Export nodes
    const nodesResult = await session.run(`
      MATCH (n)
      RETURN n, labels(n) as labels
    `);
    
    const nodes = nodesResult.records.map(record => ({
      labels: record.get('labels'),
      properties: record.get('n').properties
    }));
    
    // Export relationships
    const relsResult = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN type(r) as type, 
             properties(r) as properties,
             labels(a) as startLabels,
             properties(a) as startProps,
             labels(b) as endLabels,
             properties(b) as endProps
    `);
    
    const relationships = relsResult.records.map(record => ({
      type: record.get('type'),
      properties: record.get('properties'),
      start: {
        labels: record.get('startLabels'),
        properties: record.get('startProps')
      },
      end: {
        labels: record.get('endLabels'),
        properties: record.get('endProps')
      }
    }));
    
    const exportData = {
      nodes,
      relationships
    };
    
    fs.writeFileSync(NEO4J_FILE, JSON.stringify(exportData, null, 2));
    console.log(`  ✅ Nodes: ${nodes.length}`);
    console.log(`  ✅ Relationships: ${relationships.length}`);
    console.log(`  📊 Total: ${nodes.length + relationships.length} items exported\n`);
    
    await session.close();
    await driver.close();
    return true;
  } catch (error) {
    console.error(`  ❌ Neo4j export failed: ${error.message}\n`);
    await driver.close();
    return false;
  }
}

// Create README with import instructions
function createReadme() {
  const readme = `# Database Export (JSON Format)

Generated: ${new Date().toISOString()}

## 📦 Contents

This folder contains database exports in JSON format:

\`\`\`
database_dumps_json/
├── mongodb/              # MongoDB collections (one JSON file per collection)
│   ├── users.json
│   ├── videometadata.json
│   ├── environments.json
│   ├── segments.json
│   ├── persons.json
│   ├── objects.json
│   ├── activities.json
│   ├── interactions.json
│   └── captions.json
│
├── postgresql.json       # All PostgreSQL tables in one file
├── neo4j.json           # Neo4j nodes and relationships
└── README.md            # This file
\`\`\`

## 🚀 Import Instructions

### Prerequisites

1. Databases must be running:
   - MongoDB on \`${process.env.MONGODB_URI || 'mongodb://localhost:27017'}\`
   - PostgreSQL on \`${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || '5432'}\`
   - Neo4j on \`${process.env.NEO4J_URI || 'bolt://localhost:7687'}\` (optional)

2. Install dependencies:
   \`\`\`bash
   cd backend
   npm install
   \`\`\`

3. Configure \`.env\` file with your database credentials

### Import All Data

\`\`\`bash
cd backend
node importDataFromJSON.js
\`\`\`

This will:
- ✅ Import all MongoDB collections
- ✅ Import all PostgreSQL tables
- ✅ Import Neo4j graph data (if configured)
- ✅ Show detailed progress and summary

### Manual Import (if needed)

#### MongoDB
\`\`\`javascript
const mongoose = require('mongoose');
const fs = require('fs');

// Connect to MongoDB
await mongoose.connect('${process.env.MONGODB_URI || 'mongodb://localhost:27017/student_action_annotation'}');

// Import collection
const data = JSON.parse(fs.readFileSync('./mongodb/users.json'));
await mongoose.connection.db.collection('users').insertMany(data);
\`\`\`

#### PostgreSQL
\`\`\`javascript
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ /* your config */ });
const data = JSON.parse(fs.readFileSync('./postgresql.json'));

// Import table
for (const [table, rows] of Object.entries(data)) {
  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    const values = rows.map(row => columns.map(col => row[col]));
    // Insert with proper SQL query...
  }
}
\`\`\`

## ⚠️ Important Notes

1. **MinIO Files**: Video files are NOT included in this export
   - MinIO object storage must be exported/imported separately
   - See main README.md for MinIO export instructions

2. **Data Format**: All data is in JSON format for easy version control

3. **Database IDs**: MongoDB ObjectIds and PostgreSQL serial IDs are preserved

4. **Neo4j Relationships**: Relationship matching uses node properties

## 🔍 Troubleshooting

### "Cannot find module" error
\`\`\`bash
cd backend
npm install
\`\`\`

### "Connection refused" error
- Make sure databases are running
- Check database credentials in \`.env\`

### "Duplicate key" error
- Database already has data
- Clear database first or skip duplicates

## 📚 More Information

See main project README: \`../README.md\`
`;

  fs.writeFileSync(path.join(DUMP_DIR, 'README.md'), readme);
  console.log(`✅ Created README: ${path.join(DUMP_DIR, 'README.md')}\n`);
}

// Create .gitignore for minio_files only
function createGitignore() {
  const gitignore = `# Ignore MinIO binary files (too large for Git)
minio_files/

# Keep JSON database dumps (text-based, Git-friendly)
# These are small and essential for the project
`;
  
  fs.writeFileSync(path.join(DUMP_DIR, '.gitignore'), gitignore);
  console.log(`✅ Created .gitignore: ${path.join(DUMP_DIR, '.gitignore')}\n`);
}

// Main export function
async function main() {
  console.log('🗄️  Database Export Tool (JSON Format)');
  console.log('=====================================\n');
  
  createDumpDirectory();
  
  const results = {
    mongodb: await exportMongoDB(),
    postgresql: await exportPostgreSQL(),
    neo4j: await exportNeo4j()
  };
  
  createReadme();
  createGitignore();
  
  console.log('=====================================');
  console.log('📊 Export Summary:');
  console.log(`  MongoDB:    ${results.mongodb ? '✅ Success' : '❌ Failed'}`);
  console.log(`  PostgreSQL: ${results.postgresql ? '✅ Success' : '❌ Failed'}`);
  console.log(`  Neo4j:      ${results.neo4j ? '✅ Success' : '⚠️  Skipped/Failed'}`);
  console.log(`\n📁 All exports saved to: ${DUMP_DIR}`);
  console.log(`\n💡 Next steps:`);
  console.log(`  1. Commit database_dumps_json/ to Git`);
  console.log(`  2. Others can run: node importDataFromJSON.js`);
  console.log(`  3. For MinIO files, export manually (see README.md)`);
  console.log('=====================================\n');
  
  process.exit(0);
}

// Run export
main().catch(error => {
  console.error('❌ Export failed:', error);
  process.exit(1);
});
