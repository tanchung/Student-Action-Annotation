# Hướng dẫn Config CORS cho MinIO

## Vấn đề
Video không hiển thị hình ảnh khi phát từ MinIO do:
1. **CORS chưa được config** - Browser block cross-origin requests
2. **Video AVI không được browser hỗ trợ** - Cần convert sang MP4

## Giải pháp

### 1. Config CORS cho MinIO (Chọn 1 trong 3 cách)

#### Cách 1: Sử dụng MinIO Console (Dễ nhất)
1. Mở MinIO Console: http://localhost:9001
2. Login với credentials: minioadmin / minioadmin  
3. Vào **Buckets** → Chọn bucket `classroom`
4. Vào tab **Access** → **Anonymous**
5. Set Access Policy là **Public** hoặc **Download**

#### Cách 2: Sử dụng mc client (Command line)
```bash
# Download mc client
# Windows: https://dl.min.io/client/mc/release/windows-amd64/mc.exe

# Config alias
mc alias set myminio http://localhost:9000 minioadmin minioadmin

# Set CORS
mc anonymous set download myminio/classroom

# Hoặc set public
mc anonymous set public myminio/classroom
```

#### Cách 3: Docker environment variables
Nếu chạy MinIO qua Docker, thêm:
```yaml
environment:
  - MINIO_BROWSER_REDIRECT_URL=http://localhost:9001
  - MINIO_API_CORS_ALLOW_ORIGIN=*
```

### 2. Convert Video AVI sang MP4

Video AVI không được browser hỗ trợ tốt. Cần convert sang MP4:

```bash
# Cài ffmpeg: https://ffmpeg.org/download.html

# Convert video
ffmpeg -i input.avi -c:v libx264 -c:a aac -strict experimental output.mp4

# Convert nhiều video
for %i in (*.avi) do ffmpeg -i "%i" -c:v libx264 -c:a aac "%~ni.mp4"
```

### 3. Restart Backend Server
Sau khi config CORS, restart backend:
```bash
cd d:\KLTN1\demo\backend
node server.js
```

## Kiểm tra

1. Mở browser console (F12)
2. Reload trang video
3. Kiểm tra network tab:
   - Video request phải có status 200
   - Response headers phải có `Access-Control-Allow-Origin: *`
4. Kiểm tra console log:
   - Phải thấy "✅ Video metadata loaded successfully"
   - Không có CORS errors

## Lưu ý

- **MP4** là format được browser hỗ trợ tốt nhất
- **AVI** cần convert sang MP4
- **Pre-signed URLs** hết hạn sau 7 ngày
- CORS chỉ cần config 1 lần
