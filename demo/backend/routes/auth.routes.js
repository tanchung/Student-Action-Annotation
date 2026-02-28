const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Định nghĩa các route
router.post('/register', authController.register);
router.post('/login', authController.login);

// --- QUAN TRỌNG: Dòng này bắt buộc phải có để sửa lỗi TypeError ---
module.exports = router;