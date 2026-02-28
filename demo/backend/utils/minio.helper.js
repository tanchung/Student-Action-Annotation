// backend/utils/minio.helper.js
const Minio = require('minio');

const minioClient = new Minio.Client({
    endPoint: '127.0.0.1', // Hoặc IP máy chủ MinIO của bạn
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin', // Thay bằng access key của bạn
    secretKey: 'minioadmin'  // Thay bằng secret key của bạn
});

const bucketName = 'classroom'; // Tên bucket chứa video

// Hàm kiểm tra và lấy link (nếu cần presigned)
const getObjectUrl = async (objectName) => {
    try {
        // Nếu muốn link có thời hạn (an toàn), dùng presigned
        // return await minioClient.presignedGetObject(bucketName, objectName, 24*60*60);
        
        // Nếu bucket là public hoặc cấu hình read-only, có thể trả về link trực tiếp
        return `http://127.0.0.1:9000/${bucketName}/${objectName}`;
    } catch (error) {
        console.error("Error generating MinIO URL:", error);
        return null;
    }
};

module.exports = { minioClient, bucketName, getObjectUrl };