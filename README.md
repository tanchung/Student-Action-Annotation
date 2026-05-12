# Student Action Annotation System

Student Action Annotation System is a multi-service platform for classroom image and video analysis. The project combines web management, AI processing, and graph modeling to help track student behavior and learning focus.

## Project Scope

- Manage users, media, and processing workflows.
- Detect person, activity, and object from images and videos.
- Sync structured results from MongoDB to Neo4j.
- Build scene graph relationships for analytics and caption generation.
- Support data export and import for backup and migration.

## Repository Structure

```text
KLTN1/
|-- demo/
|   |-- backend/                 # Node.js and Express API
|   |-- frontend/                # React and Vite frontend
|   `-- ai_service/              # Python AI and graph sync services
|-- start-servers.ps1            # Start backend and frontend on Windows
`-- README.md                    # Root overview
```

## Core Architecture

- Backend: Node.js, Express, MongoDB, PostgreSQL, Neo4j, MinIO.
- Frontend: React, Vite, Tailwind CSS.
- AI service: Python, YOLO models, OpenCV, DeepSORT, MongoDB, Neo4j.

## Main Data Flow

1. Media is uploaded and processed by AI scripts.
2. Detection results are stored in MongoDB.
3. Graph sync converts MongoDB records into Neo4j nodes and relationships.
4. Person-Object relationships are inferred with weighted conditional probability.
5. Captions and analytics are generated from graph context.

## Conditional Relationship Model

The system uses statistics from `demo/ai_service/conditional_relationship_stats.csv`.

Weighted formula:

P(relationship) = (quantity x weight) / sum(quantity x weight)

- Action relationships use a higher weight.
- `no_interaction` uses a lower weight.
- If there is no valid statistical evidence, no Person-Object relationship is created.

This prevents forced labels and keeps graph quality stable.

## Requirements

- Node.js 18+
- Python 3.10+
- MongoDB 6+
- PostgreSQL 14+
- Neo4j 5+
- MinIO
- FFmpeg

## Quick Start

1. Install backend dependencies:

```bash
cd demo/backend
npm install
```

2. Install frontend dependencies:

```bash
cd demo/frontend/frontend
npm install
```

3. Configure environment variables for backend and AI service.

4. Start services:

```powershell
.\start-servers.ps1
```

5. Run AI scripts when needed from `demo/ai_service`.

## Data Utilities

- Export data:

```bash
cd demo/backend
node exportDataToJSON.js
```

- Import data:

```bash
cd demo/backend
node importDataFromJSON.js
```

## Documentation

For detailed modules, scripts, and workflow instructions, see `demo/README.md`.

## Security Notes

- Change all default credentials before production.
- Keep `.env` files out of version control.
- Use a strong `JWT_SECRET`.
- Enable HTTPS and proper CORS in production.

## License

Proprietary. All rights reserved.

Last updated: April 2026
