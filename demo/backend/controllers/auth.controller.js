const PGUserAdapter = require('../adapters/PGUserAdapter');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = 'KLTN_SECRET_KEY_123456';

function generateUserId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

exports.register = async (req, res) => {
  try {
    const { username, password, role, full_name, email, dateOfBirth } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập username, password và email' });
    }

    const existingUsername = await PGUserAdapter.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username đã tồn tại' });
    }

    const existingEmail = await PGUserAdapter.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const newUser = await PGUserAdapter.create({
      id: generateUserId(),
      username,
      password,
      role: role || 'user',
      full_name,
      email,
      dateOfBirth: dateOfBirth || null,
      nonLocked: true,
      isEnabled: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công!',
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        full_name: newUser.full_name,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập username và password' });
    }

    const user = await PGUserAdapter.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Username không tồn tại' });
    }

    if (!user.isEnabled) {
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị vô hiệu hóa' });
    }

    if (!user.nonLocked) {
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị khóa' });
    }

    const isMatch = await PGUserAdapter.comparePassword(user.password, password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu không đúng' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Không xác thực được người dùng' });
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu cũ và mật khẩu mới' });
    }

    const user = await PGUserAdapter.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const isMatch = await PGUserAdapter.comparePassword(user.password, oldPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu cũ không đúng' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await PGUserAdapter.findByIdAndUpdate(userId, { password: hashedPassword });

    return res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Change Password Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi đổi mật khẩu' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Không xác thực được người dùng' });
    }

    const user = await PGUserAdapter.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const { password, ...safeUser } = user;
    return res.status(200).json({ success: true, result: safeUser });
  } catch (error) {
    console.error('Get Current User Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lấy thông tin người dùng' });
  }
};

exports.logout = async (req, res) => {
  return res.status(200).json({ success: true, message: 'Đăng xuất thành công' });
};
