const express = require('express');
const router = express.Router();
const multer = require('multer');

// Import Controllers
const imageController = require('../controllers/image.controller');
const imageUploadController = require('../controllers/imageUpload.controller');

// Import Middleware
const { verifyToken, verifyUserExists, isAdmin } = require('../middlewares/auth.middleware');

// Cấu hình Multer (Lưu bộ nhớ tạm để buffer lên MinIO)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ==========================================
// 1. ROUTE UPLOAD IMAGE
// ==========================================
router.post('/upload', verifyToken, verifyUserExists, upload.single('image'), imageUploadController.uploadImage);

// ==========================================
// 2. ROUTES TRUY VẤN
// ==========================================
router.get('/list', verifyToken, imageController.getListImages);
router.get('/dashboard-stats', verifyToken, imageController.getDashboardStats);

// ==========================================
// SOFT DELETE ROUTES - Must be before /:image_id routes
// ==========================================
router.post('/:image_id/soft-delete', verifyToken, imageController.softDeleteImage);
router.post('/:image_id/restore', verifyToken, isAdmin, imageController.restoreImage);

// ==========================================
// AI ANALYSIS ROUTE - Must be before /:image_id routes
// ==========================================
router.post('/:image_id/analyze', verifyToken, verifyUserExists, imageController.analyzeImage);

// Các routes cụ thể
router.get('/:image_id/metadata', verifyToken, imageController.getImageFullMetadata);
router.get('/:image_id/full', verifyToken, imageController.getImageFullMetadata);
router.get('/:image_id/postgres', verifyToken, imageController.getImagePostgresData);
router.get('/:image_id/neo4j', verifyToken, imageController.getImageGraphData);
router.get('/:image_id', verifyToken, imageController.getImageById);

// ==========================================
// 3. ROUTES ADMIN (Cập nhật dữ liệu)
// ==========================================
router.put('/update-metadata', verifyToken, isAdmin, imageController.updateCollectionData);
router.put('/update-postgres', verifyToken, isAdmin, imageController.updatePostgresData);
router.put('/update-neo4j-node', verifyToken, isAdmin, imageController.updateNeo4jNode);
router.put('/update-neo4j-rel', verifyToken, isAdmin, imageController.updateNeo4jRel);

// ==========================================
// 4. ROUTES XÓA IMAGE
// ==========================================
router.delete('/:image_id/permanent', verifyToken, isAdmin, imageController.deleteImagePermanently);

module.exports = router;
