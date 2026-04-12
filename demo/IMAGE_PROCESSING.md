# Hệ thống xử lí hình ảnh

## Tổng quan

Hệ thống xử lí hình ảnh được xây dựng tương tự như hệ thống xử lí video hiện có, cho phép:
- Upload và quản lý hình ảnh
- Tự động tối ưu hóa hình ảnh (chuyển đổi sang WebP)
- Phát hiện đối tượng, người, và thực thể trong ảnh
- Xây dựng scene graph biểu diễn quan hệ giữa các đối tượng
- Phân loại hoạt động và bối cảnh
- Lưu trữ metadata vào MongoDB, PostgreSQL, và Neo4j

## Cấu trúc dự án

### Backend

```
backend/
├── models/
│   └── ImageMetadata.js          # Model MongoDB cho image
├── controllers/
│   ├── image.controller.js       # CRUD operations cho image
│   └── imageUpload.controller.js # Logic upload image
├── routes/
│   └── image.routes.js           # API routes cho image
├── utils/
│   └── image.helper.js           # Utilities xử lí ảnh (sharp)
└── server.js                      # Main server (đã thêm image routes)
```

### AI Service

```
ai_service/
├── ai_pipeline/
│   ├── object_detector.py        # Phát hiện đối tượng
│   ├── scene_graph_builder.py    # Xây dựng scene graph
│   ├── action_classifier.py      # Phân loại hoạt động
│   └── orchestrator.py           # Điều phối AI pipeline
├── api.py                         # Flask API endpoints
└── requirements.txt               # Python dependencies
```

### Frontend

```
frontend/src/pages/admin/
└── ImageManager.jsx               # Component quản lý image
```

## Cài đặt

### 1. Backend Dependencies

```bash
cd demo/backend
npm install
# Sharp đã được thêm vào package.json
```

### 2. AI Service Dependencies

```bash
cd demo/ai_service
pip install -r requirements.txt
# Flask và Flask-CORS đã được thêm vào requirements.txt
```

## API Endpoints

### Backend API (Node.js/Express)

**Base URL:** `http://localhost:5000/api/images`

#### Upload Image
```http
POST /upload
Content-Type: multipart/form-data

Body:
- image: File (hình ảnh)
- customName: String (optional, tên tùy chỉnh)

Response:
{
  "success": true,
  "message": "Upload hình ảnh thành công",
  "data": {
    "_id": "...",
    "image_name": "...",
    "width": 1920,
    "height": 1080,
    "format": "webp",
    "minio_url": "...",
    ...
  }
}
```

#### Get List Images
```http
GET /list
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "count": 10,
  "data": [...]
}
```

#### Get Image by ID
```http
GET /:image_id
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "result": {...}
}
```

#### Get Full Metadata
```http
GET /:image_id/metadata
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "image": {...},
    "related_data": {
      "persons": [...],
      "entity_object": [...],
      "activities": [...],
      ...
    }
  }
}
```

#### Soft Delete Image
```http
POST /:image_id/soft-delete
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Xóa hình ảnh thành công (soft delete)"
}
```

#### Restore Image
```http
POST /:image_id/restore
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Khôi phục hình ảnh thành công"
}
```

### AI Service API (Python/Flask)

**Base URL:** `http://localhost:5001/api`

#### Process Single Image
```http
POST /process-image
Content-Type: multipart/form-data

Body:
- image: File (hình ảnh)

Response:
{
  "success": true,
  "data": {
    "detections": {
      "persons": [...],
      "entities": [...],
      "num_persons": 2,
      "num_entities": 5
    },
    "scene_graph": {
      "nodes": [...],
      "edges": [...]
    },
    "activities": [...],
    "scene": {
      "scene_type": "office",
      "confidence": 0.8
    }
  }
}
```

#### Process Batch
```http
POST /process-batch
Content-Type: multipart/form-data

Body:
- images: File[] (multiple images)

Response:
{
  "success": true,
  "total": 5,
  "processed": 5,
  "results": [...]
}
```

#### Analyze from URL
```http
POST /analyze-url
Content-Type: application/json

Body:
{
  "url": "https://example.com/image.jpg"
}

Response:
{
  "success": true,
  "data": {...}
}
```

## Workflow xử lí hình ảnh

1. **Upload hình ảnh**
   - User upload hình ảnh qua frontend
   - Backend validate file (type, size)
   - Extract metadata (dimensions, format, size)
   - Optimize image (convert to WebP if beneficial)
   - Generate thumbnail
   - Upload to MinIO
   - Save metadata to MongoDB

2. **AI Processing** (optional, triggered separately)
   - Send image to AI Service
   - Object detection (persons, entities)
   - Scene graph construction (relationships)
   - Activity classification
   - Scene classification
   - Save results to PostgreSQL and Neo4j

3. **Query and Display**
   - Get image list with pre-signed URLs
   - View full metadata including AI analysis
   - Query relationships via Neo4j graph

## Database Schema

### MongoDB (Collection: `image`)
```javascript
{
  _id: ObjectId,
  image_name: String,
  width: Number,
  height: Number,
  minio_url: String,
  environment_id: ObjectId,
  created_at: Date,
  uploader_id: ObjectId,
  embedding: [Number],
  status: String,
  format: String,
  file_size: Number,
  error_message: String,
  is_deleted: Boolean,
  deleted_at: Date
}
```

### PostgreSQL Tables
- `images` - Thông tin cơ bản về image
- `persons` - Người được phát hiện trong ảnh
- `entity_objects` - Đối tượng được phát hiện
- `activities` - Hoạt động được phân loại
- `interactions` - Tương tác giữa người và đối tượng
- `captions` - Mô tả/chú thích

### Neo4j Graph
- Nodes: `:Image`, `:Person`, `:Entity`, `:Activity`, `:Environment`
- Relationships: `HAS_PERSON`, `HAS_ENTITY`, `PERFORMS_ACTIVITY`, `SPATIAL_RELATION`, `INTERACTS_WITH`

## Sử dụng Frontend Component

1. Import component vào routes:
```jsx
import ImageManager from './pages/admin/ImageManager';

// Trong route config:
<Route path="/admin/images" element={<ImageManager />} />
```

2. Thêm link vào sidebar/menu:
```jsx
<Link to="/admin/images">Quản lý Hình ảnh</Link>
```

## Khởi động hệ thống

### 1. Start Backend
```bash
cd demo/backend
npm install  # Nếu chưa cài
node server.js
```

### 2. Start AI Service
```bash
cd demo/ai_service
pip install -r requirements.txt  # Nếu chưa cài
python api.py
```

### 3. Start Frontend
```bash
cd demo/frontend/frontend
npm install  # Nếu chưa cài
npm run dev
```

## So sánh Video vs Image Processing

| Feature | Video | Image |
|---------|-------|-------|
| Model | VideoMetadata.js | ImageMetadata.js |
| Controller | video.controller.js | image.controller.js |
| Upload Handler | upload.controller.js | imageUpload.controller.js |
| Helper Utility | video.helper.js (ffmpeg) | image.helper.js (sharp) |
| Routes | /api/videos | /api/images |
| Frontend | VideoManager.jsx | ImageManager.jsx |
| Duration/FPS | ✅ Yes | ❌ N/A |
| Dimensions | ✅ Yes | ✅ Yes |
| Format | MP4, AVI, etc. | JPG, PNG, WebP, etc. |
| Optimization | H.264 conversion | WebP conversion |

## Lưu ý

1. **Dependencies mới:**
   - Backend: `sharp` (image processing)
   - AI Service: `Flask`, `Flask-CORS`, `opencv-python`, `pillow`

2. **MinIO Bucket:**
   - Sử dụng cùng bucket với video
   - Files được đặt tên với timestamp prefix để tránh trùng

3. **AI Models:**
   - Object detector: YOLOv5 hoặc custom model
   - Action classifier: Custom trained model
   - Có thể cấu hình model path trong `ai_config`

4. **Performance:**
   - Images được optimize tự động (WebP)
   - Thumbnails được sinh tự động
   - Pre-signed URLs có thời hạn 24h

## Mở rộng trong tương lai

- [ ] Batch upload multiple images
- [ ] Image annotation tool
- [ ] Image similarity search
- [ ] Advanced image filters
- [ ] Image transformation (crop, rotate, etc.)
- [ ] Image comparison tools
- [ ] Export/import image metadata
