# Database Export (JSON Format)

Generated: 2026-03-01T04:25:31.763Z

## 📦 Contents

This folder contains database exports in JSON format:

```
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
```

## 🚀 Import Instructions

### Prerequisites

1. Databases must be running:
   - MongoDB on `mongodb://127.0.0.1:27017/classroom_kg`
   - PostgreSQL on `localhost:5432`
   - Neo4j on `bolt://localhost:7687` (optional)

2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Configure `.env` file with your database credentials

### Import All Data

```bash
cd backend
node importDataFromJSON.js
```

This will:
- ✅ Import all MongoDB collections
- ✅ Import all PostgreSQL tables
- ✅ Import Neo4j graph data (if configured)
- ✅ Show detailed progress and summary

### Manual Import (if needed)

#### MongoDB
```javascript
const mongoose = require('mongoose');
const fs = require('fs');

// Connect to MongoDB
await mongoose.connect('mongodb://127.0.0.1:27017/classroom_kg');

// Import collection
const data = JSON.parse(fs.readFileSync('./mongodb/users.json'));
await mongoose.connection.db.collection('users').insertMany(data);
```

#### PostgreSQL
```javascript
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
```

## ⚠️ Important Notes

1. **MinIO Files**: Video files are NOT included in this export
   - MinIO object storage must be exported/imported separately
   - See main README.md for MinIO export instructions

2. **Data Format**: All data is in JSON format for easy version control

3. **Database IDs**: MongoDB ObjectIds and PostgreSQL serial IDs are preserved

4. **Neo4j Relationships**: Relationship matching uses node properties

## 🔍 Troubleshooting

### "Cannot find module" error
```bash
cd backend
npm install
```

### "Connection refused" error
- Make sure databases are running
- Check database credentials in `.env`

### "Duplicate key" error
- Database already has data
- Clear database first or skip duplicates

## 📚 More Information

See main project README: `../README.md`
