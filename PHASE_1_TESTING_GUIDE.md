# Phase 1 Quick Start & Testing Guide

## Prerequisites
- PostgreSQL running on localhost:5432 (database: `classroom_pg`, user: `postgres`, password: `12345`)
- MongoDB running on localhost:27017
- Node.js 18+ installed
- Backend dependencies installed: `npm install` in `demo/backend/`

## Files Changed
```
d:\KLTN1\demo\backend\services\pgMirrorService.js       (NEW)
d:\KLTN1\demo\backend\controllers\upload.controller.js  (modified)
d:\KLTN1\demo\backend\controllers\imageUpload.controller.js (modified)
d:\KLTN1\demo\backend\controllers\video.controller.js   (modified)
d:\KLTN1\demo\backend\controllers\image.controller.js   (modified)
d:\KLTN1\test-pg-mirror.js                              (NEW)
```

## Step 1: Verify Database Connection

Run the test script:
```powershell
cd d:\KLTN1
node test-pg-mirror.js
```

Expected output:
```
✅ Connected to PostgreSQL: { now: 2024-05-02T... }
✅ Tables found:
   - activities_catalog
   - captions
   - interactions
   - media_assets
   - objects_catalog
   - persons_catalog
   - segments
   - users
✅ media_assets columns:
   - id: uuid
   - mongo_id: character varying
   - type: character varying
   - name: character varying
   - uploader_id: character varying
✅ captions columns:
   - id: uuid
   - media_id: uuid
   - mongo_id: character varying
   - content: text
```

## Step 2: Start Backend Server

```powershell
cd d:\KLTN1\demo\backend
npm start
# or
node server.js
```

You should see:
```
✅ Connected to MongoDB
✅ Neo4j driver initialized
✅ PostgreSQL pool ready
🚀 Server running on port 3000
```

## Step 3: Test Upload → Mirror

### Test 3a: Upload a Video

```bash
curl -X POST http://localhost:3000/api/videos/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-video.mp4" \
  -F "customName=TestVideo"
```

Or use your frontend

**Expected behavior**:
1. ✅ API response returns immediately with 201 status and video metadata
2. ✅ Video appears in MongoDB `video` collection
3. ✅ MinIO has the video file
4. ⏳ **Background**: Monitor PostgreSQL for mirror

**Check PostgreSQL**:
```sql
-- In PostgreSQL terminal or tool
SELECT * FROM media_assets WHERE type = 'video';
-- Should show your uploaded video with mongo_id
```

### Test 3b: Upload an Image

Similar process:
```bash
curl -X POST http://localhost:3000/api/images/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-image.jpg" \
  -F "customName=TestImage"
```

**Check PostgreSQL**:
```sql
SELECT * FROM media_assets WHERE type = 'image';
```

## Step 4: Test AI Analysis → Mirror

### Test 4a: Analyze a Video

```bash
curl -X POST http://localhost:3000/api/videos/analyze/YOUR_VIDEO_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected behavior**:
1. ✅ API response returns immediately with 200 status "processing"
2. ✅ Backend starts Python process (watch console output)
3. ✅ Python processes video (10-30 seconds depending on length)
4. ✅ MongoDB status changes: uploaded → processing → done (or error)
5. ✅ Segments, persons, objects, activities created in MongoDB
6. ✅ Caption generated and saved to MongoDB caption collection
7. ⏳ **Background**: Mirror results to PostgreSQL

**Watch Backend Console**:
```
🐍 Launching video AI analysis:
   Script: .../ai_service/process_video.py
   Video : C:\Users\...\temp\...
   ID    : 65abc123def456...

[VideoAI stdout]: Processing frame 1/120...
[VideoAI stdout]: Detected 5 persons, 8 objects, 12 activities
...
Video AI process exited with code: 0

✅ pgMirror: Queued 42 mirror operations for video 65abc123def456...
✅ pgMirror: Mirrored segment - 507f1f77bcf86cd799439011
✅ pgMirror: Mirrored person - 507f1f77bcf86cd799439012
```

**Check PostgreSQL After Analysis**:
```sql
-- Check video was mirrored
SELECT * FROM media_assets WHERE mongo_id = 'YOUR_VIDEO_MONGO_ID';

-- Check segments were mirrored
SELECT s.mongo_id, s.media_id, m.name, m.type
FROM segments s
JOIN media_assets m ON s.media_id = m.id
ORDER BY s.mongo_id;

-- Check persons were mirrored
SELECT * FROM persons_catalog LIMIT 5;

-- Check objects were mirrored
SELECT * FROM objects_catalog LIMIT 5;

-- Check activities were mirrored
SELECT * FROM activities_catalog LIMIT 5;

-- Check captions were mirrored
SELECT c.mongo_id, c.content, m.name
FROM captions c
JOIN media_assets m ON c.media_id = m.id;

-- Check interactions (Person → Activity → Object)
SELECT 
  STRING_AGG(DISTINCT pr.role, ', ') as persons,
  STRING_AGG(DISTINCT ac.activity_name, ', ') as activities,
  STRING_AGG(DISTINCT ob.object_name, ', ') as objects,
  COUNT(*) as interaction_count
FROM interactions i
LEFT JOIN persons_catalog pr ON i.person_id = pr.id
LEFT JOIN activities_catalog ac ON i.activity_id = ac.id
LEFT JOIN objects_catalog ob ON i.object_id = ob.id;
```

### Test 4b: Analyze an Image

```bash
curl -X POST http://localhost:3000/api/images/analyze/YOUR_IMAGE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Similar process to video analysis.

**Check PostgreSQL After Analysis**:
```sql
-- Same queries as above, but for image analysis results
-- Image will be in media_assets with type='image'
SELECT * FROM media_assets WHERE type = 'image' AND mongo_id = 'YOUR_IMAGE_MONGO_ID';
```

## Step 5: Verify No AI Output Changes

### Compare MongoDB vs PostgreSQL (should have same data)

**MongoDB** (source-of-truth - should still work):
```javascript
// In backend or mongo shell
db.caption.findOne({ image_id: ObjectId('YOUR_ID') })
// Should still return caption with all fields
```

**PostgreSQL** (mirror - should have same caption text):
```sql
SELECT * FROM captions WHERE mongo_id = 'CAPTION_MONGO_ID';
-- Should have same content as MongoDB caption.caption field
```

## Step 6: Monitor for Errors

### Check Backend Logs
```
// If PostgreSQL mirror fails (non-critical):
❌ pgMirror: Failed to mirror segment: connect ECONNREFUSED 127.0.0.1:5432

// This is OK - AI pipeline continues, just no mirror this time
// Can retry manually or wait for next analysis
```

### Check Database Logs
```powershell
# PostgreSQL logs (if using service)
# Watch for connection errors or constraint violations
```

## Step 7: Performance Baseline

Measure response times to ensure Phase 1 is non-blocking:

```powershell
# Backend response time should be same as before
measure-command {
  curl -X POST http://localhost:3000/api/videos/analyze/ID `
    -H "Authorization: Bearer TOKEN"
}
# Should be < 100ms for "processing" response

# PostgreSQL mirror happens in background:
# - Monitor via SELECT COUNT(*) on each table
# - Should gradually increase as mirror operations complete
# - Should NOT block video response
```

## Troubleshooting

### PostgreSQL Mirror Not Working

1. **Check PostgreSQL is running**:
```powershell
netstat -an | findstr 5432
# Should show listening on 5432
```

2. **Check PostgreSQL credentials**:
```powershell
psql -h localhost -U postgres -d classroom_pg -c "SELECT 1"
# Should return (1)
```

3. **Check tables exist**:
```powershell
psql -h localhost -U postgres -d classroom_pg -c "SELECT tablename FROM pg_tables WHERE schemaname='public'"
# Should list all 8 tables
```

4. **Check MongoDB connection**:
```javascript
// In node
const mongoose = require('mongoose');
await mongoose.connect('mongodb://localhost:27017/classroom');
db.listCollections()
// Should show all 10 collections
```

5. **Force verbose logging** in `pgMirrorService.js`:
```javascript
// Add console.log at start of each function
console.log('🔍 DEBUG: Entering mirrorMediaAsset', mongoDoc._id);
```

### MongoDB Mirror Not Finding Data

If mirror queries return empty arrays:

1. **Check video_id format**:
```javascript
// In process_video.py, verify video_id matches MongoDB _id format
// video_id should be string representation of ObjectId
```

2. **Verify collections exist**:
```javascript
// MongoDB shell
db.getCollectionNames()
// Should include: segment, person, entity_object, activity, caption, etc.
```

3. **Verify data in collections**:
```javascript
// MongoDB shell
db.segment.findOne({ video_id: ObjectId('YOUR_VIDEO_ID') })
// Should return segment documents
```

### PostgreSQL Queries Return No Data

**Expected at first** - mirror happens asynchronously:

1. First 1-2 seconds: No data in PostgreSQL (mirror in progress)
2. After 5 seconds: Data should appear
3. Check backend console for mirror completion logs

To force wait:
```bash
sleep 5  # Wait 5 seconds for mirror to complete
# Then query PostgreSQL again
```

## Quick Verification Checklist

- [ ] PostgreSQL connection test passes
- [ ] Backend starts without errors
- [ ] Video upload mirrors to media_assets
- [ ] Image upload mirrors to media_assets
- [ ] Video analysis completes successfully
- [ ] Segments, persons, objects, activities appear in PostgreSQL
- [ ] Captions appear in PostgreSQL captions table
- [ ] Caption text matches MongoDB caption document
- [ ] No errors in backend console
- [ ] Response times unchanged (< 100ms for async operations)
- [ ] Can still query MongoDB directly (data intact)
- [ ] Can rollback by removing mirror calls (no data needed from PostgreSQL)

---

## Next: Phase 2 Planning

After Phase 1 is validated:
1. Create migration script: MongoDB users → PostgreSQL
2. Refactor auth controllers to use PostgreSQL
3. Create migration status tracking
4. Test user login after migration
5. Test permission checks still work with pg user.id

See `PHASE_2_PLANNING.md` (to be created)

---

**Status**: Ready to Test  
**Contact**: If issues, check backend console and database logs first
