const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Key này phải khớp với key bên middleware
const JWT_SECRET = "KLTN_SECRET_KEY_123456"; 

// 1. Đăng ký
exports.register = async (req, res) => {
    try {
        const { username, password, role, full_name, email } = req.body;

        // Kiểm tra username đã tồn tại chưa
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username đã tồn tại" });
        }

        // Tạo user mới (password sẽ tự động hash bởi pre-save hook)
        const newUser = new User({
            username,
            password,  // Không hash ở đây, để model tự hash
            role: role || 'user',
            full_name,
            email
        });

        await newUser.save();

        res.status(201).json({ success: true, message: "Đăng ký thành công!" });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi đăng ký" });
    }
};

// 2. Đăng nhập
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Tìm user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, message: "Username không tồn tại" });
        }

        // Kiểm tra mật khẩu bằng method của model
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Mật khẩu không đúng" });
        }

        // Tạo Token
        const token = jwt.sign(
            { id: user._id, role: user.role, username: user.username },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(200).json({
            success: true,
            message: "Đăng nhập thành công",
            token,
            user: {
                username: user.username,
                role: user.role,
                full_name: user.full_name
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi đăng nhập" });
    }
};