# Student Action Annotation System

Enterprise-grade video annotation platform for educational institutions. Supports multi-database architecture with MongoDB, PostgreSQL, Neo4j, and MinIO object storage.

## 🏗️ Architecture

```
KLTN1/
├── demo/                           # Main application
│   ├── backend/                    # Node.js + Express API
│   │   ├── config/                # Database connections
│   │   ├── controllers/           # Business logic
│   │   ├── middlewares/           # Auth & validation
│   │   ├── models/                # MongoDB schemas
│   │   ├── routes/                # API endpoints
│   │   ├── utils/                 # Helper functions
│   │   ├── migrations/            # Database migrations
│   │   ├── database_dumps_json/   # Export/import data
│   │   ├── exportDataToJSON.js    # Database export script
│   │   ├── importDataFromJSON.js  # Database import script
│   │   ├── seedAdmin.js           # Create admin user
│   │   └── server.js              # Application entry point
│   │
│   ├── frontend/                   # React application
│   │   └── frontend/
│   │       ├── src/
│   │       │   ├── api/           # HTTP client
│   │       │   ├── components/    # Reusable UI components
│   │       │   ├── layouts/       # Page layouts
│   │       │   └── pages/         # Application pages
│   │       │       ├── admin/     # Admin dashboard
│   │       │       ├── auth/      # Login/register
│   │       │       └── user/      # Student interface
│   │       └── vite.config.js
│   │
│   └── README.md                   # Full documentation
│
├── start-servers.ps1               # Start both servers (Windows)
└── .gitignore                      # Version control rules
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 6+
- PostgreSQL 14+
- Neo4j 5+ (optional)
- MinIO Server
- FFmpeg

### Installation

```bash
# Install backend dependencies
cd demo/backend
npm install

# Install frontend dependencies
cd ../frontend/frontend
npm install
```

### Configuration

1. **Copy environment template:**
   ```bash
   cd demo/backend
   cp .env.example .env
   ```

2. **Update database credentials in `.env`:**
   - `PG_PASSWORD` - PostgreSQL password
   - `NEO4J_PASSWORD` - Neo4j password (if using)
   - `JWT_SECRET` - Change to secure random string

3. **Start databases:**
   - MongoDB: `net start MongoDB` (Windows) or `sudo systemctl start mongod` (Linux)
   - PostgreSQL: `net start postgresql-x64-14` (Windows) or `sudo systemctl start postgresql` (Linux)
   - MinIO: `minio server C:\data\minio` (Windows) or `minio server /data/minio` (Linux)

4. **Run database migrations:**
   ```bash
   cd demo/backend
   psql -U postgres -d classroom_pg -f migrations/add_soft_delete_columns.sql
   ```

5. **Create admin user:**
   ```bash
   node seedAdmin.js
   ```

### Running

**Option 1: PowerShell Script (Recommended for Windows)**
```powershell
.\start-servers.ps1
```

**Option 2: Manual Start**
```bash
# Terminal 1 - Backend
cd demo/backend
node server.js

# Terminal 2 - Frontend  
cd demo/frontend/frontend
npm run dev
```

### Access Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000
- **Admin Login:** `admin` / `admin123`

## 📊 Data Management

### Export Database

Export real data to JSON format (Git-friendly):

```bash
cd demo/backend
node exportDataToJSON.js
```

Creates `database_dumps_json/` with:
- MongoDB collections (JSON)
- PostgreSQL tables (JSON)
- Neo4j graph data (JSON)

### Import Database

Restore data from JSON exports:

```bash
cd demo/backend
node importDataFromJSON.js
```

Safely imports data with 3-second countdown and confirmation.

## 🛠️ Technology Stack

**Backend:**
- Node.js + Express.js
- MongoDB (video metadata)
- PostgreSQL (relational data)
- Neo4j (graph relationships)
- MinIO (object storage)
- JWT authentication

**Frontend:**
- React 19.2
- Vite (build tool)
- Tailwind CSS
- React Router
- Axios

## 📖 Documentation

See [demo/README.md](demo/README.md) for comprehensive documentation including:
- API documentation
- Database schemas
- Feature descriptions
- Troubleshooting guide

## 🔒 Security Notes

1. **Change default passwords** in `.env` before production deployment
2. **Use strong JWT_SECRET** - generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
3. **Configure MinIO CORS** for production domains
4. **Enable HTTPS** for production environment
5. **Never commit `.env`** file to version control

## 🤝 Development Workflow

1. **Clone repository:**
   ```bash
   git clone <repository-url>
   cd KLTN1
   ```

2. **Install dependencies** (see Installation section)

3. **Configure environment** (see Configuration section)

4. **Import sample data** (optional):
   ```bash
   cd demo/backend
   node importDataFromJSON.js
   ```

5. **Start development servers** and begin coding

## 📝 License

Proprietary - All rights reserved

## 👥 Contributors

[Your Team/Company Name]

---

**Last Updated:** March 2026
