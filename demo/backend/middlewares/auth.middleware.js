const jwt = require('jsonwebtoken');
const PGUserAdapter = require('../adapters/PGUserAdapter');

const JWT_SECRET = 'KLTN_SECRET_KEY_123456';

exports.verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ success: false, message: 'Không có quyền truy cập (Thiếu Token)' });
  }

  try {
    const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(actualToken, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

exports.isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Yêu cầu quyền Admin!' });
};

exports.verifyUserExists = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Không xác thực được người dùng' });
    }

    const user = await PGUserAdapter.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    if (!user.isEnabled) {
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị vô hiệu hóa' });
    }

    if (!user.nonLocked) {
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị khóa' });
    }

    req.user.dbUser = user;
    return next();
  } catch (error) {
    console.error('verifyUserExists error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi xác thực người dùng' });
  }
};
