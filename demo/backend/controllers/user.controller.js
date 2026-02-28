const User = require('../models/User');

// 1. Lấy danh sách user (Search, Sort, Filter Role)
exports.getUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      role = "user", 
      sortBy = "createdAt", 
      sortDir = "desc" 
    } = req.query;

    const filter = {
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } }
      ]
    };

    // Nếu role khác 'all' thì lọc, ngược lại lấy tất cả
    if (role && role !== 'all') {
        filter.role = role;
    }

    const sortOrder = sortDir === 'asc' ? 1 : -1;
    const sortField = sortBy === 'id' ? '_id' : sortBy; 

    const users = await User.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-password'); // Không trả về mật khẩu

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      result: {
        content: users,
        page: {
          totalPages: Math.ceil(total / limit),
          totalElements: total,
          currentPage: parseInt(page)
        }
      }
    });

  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách user" });
  }
};

// 2. Lấy chi tiết 1 User
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }
    res.json({ success: true, result: user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// 3. Tạo User mới (Admin Create)
exports.createUser = async (req, res) => {
  try {
    const { username, password, email, full_name, role, dateOfBirth, nonLocked } = req.body;

    // Validate cơ bản
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập Username và Password" });
    }

    // Check trùng username hoặc email
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Username hoặc Email đã tồn tại!" });
    }

    // Tạo User mới
    const newUser = new User({
      username,
      password, // Hook trong model sẽ tự hash password này
      email,
      full_name,
      role: role || "user",
      dateOfBirth: dateOfBirth || null,
      nonLocked: nonLocked !== undefined ? nonLocked : true,
      isEnabled: true
    });

    await newUser.save();

    res.status(201).json({ success: true, message: "Tạo tài khoản thành công!", result: newUser });

  } catch (error) {
    console.error("Create User Error:", error);
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: "Lỗi server khi tạo user" });
  }
};

// 4. Cập nhật User
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Bảo mật: Không cho phép sửa password, username, _id qua API này
    delete updateData.password; 
    delete updateData.username; 
    delete updateData._id;

    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user để sửa" });
    }

    res.json({ success: true, message: "Cập nhật thành công", result: updatedUser });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ success: false, message: "Lỗi cập nhật" });
  }
};

// 5. Xóa User
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Xóa thành công" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Lỗi xóa user" });
    }
};