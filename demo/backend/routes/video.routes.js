const express = require('express');
const router = express.Router();
const multer = require('multer');

// Import Controllers
const videoController = require('../controllers/video.controller');
const uploadController = require('../controllers/upload.controller'); // Import controller mới tách

// Import Middleware
const { verifyToken, isAdmin } = require('../middlewares/auth.middleware');

// Cấu hình Multer (Lưu bộ nhớ tạm để buffer lên MinIO)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ==========================================
// 1. ROUTE UPLOAD (Quan trọng nhất)
// ==========================================
// Yêu cầu: Phải đăng nhập (verifyToken) để lấy uploader_id
router.post('/upload', verifyToken, upload.single('video'), uploadController.uploadVideo);


// ==========================================
// 2. ROUTES TRUY VẤN (PUBLIC hoặc PROTECTED tùy nghiệp vụ)
// ==========================================
// Hiện tại để verifyToken để bảo mật cơ bản, ai có tk mới xem được
router.get('/list', verifyToken, videoController.getListVideos);
// Các routes cụ thể phải đặt TRƯỚC route động /:video_id
router.get('/:video_id/metadata', verifyToken, videoController.getVideoFullMetadata);
router.get('/:video_id/full', verifyToken, videoController.getVideoFullMetadata);
router.get('/:video_id/postgres', verifyToken, videoController.getVideoPostgresData);
router.get('/:video_id/neo4j', verifyToken, videoController.getVideoGraphData);
// Route động /:video_id phải đặt CUỐI CÙNG
router.get('/:video_id', verifyToken, videoController.getVideoById);


// ==========================================
// 3. ROUTES ADMIN (Cập nhật dữ liệu)
// ==========================================
router.put('/update-metadata', verifyToken, isAdmin, videoController.updateCollectionData);
router.put('/update-postgres', verifyToken, isAdmin, videoController.updatePostgresData);
router.put('/update-neo4j-node', verifyToken, isAdmin, videoController.updateNeo4jNode);
router.put('/update-neo4j-rel', verifyToken, isAdmin, videoController.updateNeo4jRel);

// ==========================================
// 4. ROUTES XÓA VIDEO
// ==========================================
router.delete('/:video_id', verifyToken, videoController.deleteVideo);

module.exports = router;