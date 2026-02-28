# MinIO CORS Fix - Restart với CORS enabled

# Nếu chạy MinIO qua command line:
minio server D:\minio-data --console-address ":9001" --address ":9000"

# Nếu chạy qua Docker:
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  -v D:\minio-data:/data \
  minio/minio server /data --console-address ":9001"

# Sau đó set bucket policy qua mc client:
mc alias set myminio http://localhost:9000 minioadmin minioadmin
mc anonymous set download myminio/classroom
