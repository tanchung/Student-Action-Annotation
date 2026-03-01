# Soft Delete Feature - Migration Guide

## Tổng quan
Chức năng Soft Delete cho phép đánh dấu video và metadata đã bị xóa thay vì xóa hoàn toàn khỏi database. Điều này giúp:
- Khôi phục dữ liệu nếu cần
- Kiểm tra lịch sử xóa
- Bảo toàn tính toàn vẹn của dữ liệu

## Các thay đổi đã thực hiện

### 1. Backend Changes

#### Video Model (MongoDB)
- Thêm field `is_deleted: Boolean` (default: false)
- Thêm field `deleted_at: Date` (default: null)

#### API Endpoints
- `POST /videos/:video_id/soft-delete` - Soft delete video (Admin only)
- `GET /videos/list?show_deleted=true` - Lấy danh sách video đã xóa

#### Video Controller
- `softDeleteVideo()` - Đánh dấu xóa video trong MongoDB, PostgreSQL và Neo4j
- Cập nhật `getListVideos()` - Hỗ trợ filter theo trạng thái deleted

### 2. PostgreSQL Migration

Chạy migration để thêm columns vào PostgreSQL:

\`\`\`bash
# Kết nối vào PostgreSQL
psql -U postgres -d student_action_annotation

# Chạy migration
\i backend/migrations/add_soft_delete_columns.sql
\`\`\`

Hoặc sử dụng pgAdmin để chạy file SQL.

### 3. MongoDB Collections

Các collections sau sẽ có field `is_deleted` và `deleted_at`:
- `video`
- `environment`
- `segment`
- `person`
- `entity_object`
- `activity`
- `interaction`
- `caption`

### 4. Neo4j

Tất cả nodes và relationships liên quan đến video sẽ được set:
- `is_deleted: true`
- `deleted_at: datetime()`

### 5. Frontend Changes

#### MetadataManager.jsx
- Button "Video đã xóa" để toggle xem video đã xóa
- Button "Xóa" ở mỗi row video với confirm dialog
- Badge hiển thị trạng thái "Đã xóa"
- Filter tự động khi toggle giữa video thường và đã xóa

## Cách sử dụng

### Cho Admin:

1. **Xóa video (Soft Delete):**
   - Vào trang Admin > Metadata
   - Click button "Xóa" ở video muốn xóa
   - Confirm dialog xuất hiện
   - Click OK để xóa

2. **Xem video đã xóa:**
   - Click button "Video đã xóa" ở góc trên bên phải
   - Danh sách chuyển sang hiển thị video đã xóa
   - Click lại button "Xem video thường" để quay lại

3. **Xem metadata của video đã xóa:**
   - Trong chế độ "Video đã xóa", click vào video
   - Có thể xem full metadata nhưng không thể xóa thêm

## API Examples

### Soft Delete Video
\`\`\`javascript
POST /videos/:video_id/soft-delete
Headers: Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "message": "Đã đánh dấu xóa video và các dữ liệu liên quan trong MongoDB, PostgreSQL và Neo4j"
}
\`\`\`

### Get Deleted Videos
\`\`\`javascript
GET /videos/list?show_deleted=true
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "count": 5,
  "data": [...]
}
\`\`\`

## Notes

- Soft delete chỉ đánh dấu, không xóa file khỏi MinIO
- Để xóa hoàn toàn, cần sử dụng endpoint DELETE (hard delete)
- Admin có thể xem tất cả video đã xóa
- User thường chỉ xem video của mình

## Rollback

Nếu cần rollback migration PostgreSQL:

\`\`\`sql
ALTER TABLE video_metadata DROP COLUMN IF EXISTS is_deleted;
ALTER TABLE video_metadata DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE video_segments DROP COLUMN IF EXISTS is_deleted;
ALTER TABLE video_segments DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE activities DROP COLUMN IF EXISTS is_deleted;
ALTER TABLE activities DROP COLUMN IF EXISTS deleted_at;
\`\`\`

## Testing

1. Login as admin
2. Go to /admin/metadata
3. Try soft delete a video
4. Toggle to "Video đã xóa"
5. Verify the video appears in deleted list
6. Check MongoDB, PostgreSQL, Neo4j for is_deleted flag
