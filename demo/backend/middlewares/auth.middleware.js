// backend/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = "KLTN_SECRET_KEY_123456"; // Phải khớp với bên controller

// 1. Xác thực Token (User nào cũng cần qua bước này)
exports.verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    
    console.log('🔐 Verify Token - Path:', req.path, 'Token:', token ? 'Present' : 'Missing');
    
    if (!token) {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập (Thiếu Token)" });
    }

    try {
        // Token thường gửi dạng "Bearer <token>", ta lấy phần sau
        const actualToken = token.startsWith("Bearer ") ? token.slice(7, token.length) : token;
        
        const decoded = jwt.verify(actualToken, JWT_SECRET);
        req.user = decoded; // Lưu thông tin user vào request để dùng sau
        console.log('✅ Token verified for user:', decoded.username, 'role:', decoded.role);
        next();
    } catch (err) {
        console.log('❌ Token verification failed:', err.message);
        return res.status(401).json({ success: false, message: "Token không hợp lệ hoặc đã hết hạn" });
    }
};

// 2. Chỉ cho phép Admin
exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: "Yêu cầu quyền Admin!" });
    }
};