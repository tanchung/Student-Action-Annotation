const PGUserAdapter = require('../adapters/PGUserAdapter');
const crypto = require('crypto');

function createUserId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

exports.getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = 'all',
      sortBy = 'createdAt',
      sortDir = 'desc',
    } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } },
      ];
    }
    if (role && role !== 'all') {
      filter.role = role;
    }

    const users = await PGUserAdapter.find(filter, {
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortDir,
    });

    const total = await PGUserAdapter.countDocuments(filter);

    const safeUsers = users.map((user) => {
      const { password, ...safe } = user;
      return safe;
    });

    return res.json({
      success: true,
      result: {
        content: safeUsers,
        page: {
          totalPages: Math.ceil(total / Number(limit)),
          totalElements: total,
          currentPage: Number(page),
        },
      },
    });
  } catch (error) {
    console.error('Get Users Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách user' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await PGUserAdapter.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const { password, ...safeUser } = user;
    return res.json({ success: true, result: safeUser });
  } catch (error) {
    console.error('Get User Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, email, full_name, role, dateOfBirth, nonLocked, isEnabled } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Username, Password và Email' });
    }

    const existingUser = await PGUserAdapter.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username đã tồn tại' });
    }

    const existingEmail = await PGUserAdapter.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const newUser = await PGUserAdapter.create({
      id: createUserId(),
      username,
      password,
      email,
      full_name,
      role: role || 'user',
      dateOfBirth: dateOfBirth || null,
      nonLocked: nonLocked !== undefined ? nonLocked : true,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
    });

    const { password: _, ...safeUser } = newUser;
    return res.status(201).json({ success: true, message: 'Tạo tài khoản thành công!', result: safeUser });
  } catch (error) {
    console.error('Create User Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi tạo user' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.password;
    delete updateData.username;
    delete updateData.id;
    delete updateData._id;

    const updatedUser = await PGUserAdapter.findByIdAndUpdate(id, updateData);
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user để sửa' });
    }

    const { password, ...safeUser } = updatedUser;
    return res.json({ success: true, message: 'Cập nhật thành công', result: safeUser });
  } catch (error) {
    console.error('Update User Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const deletedUser = await PGUserAdapter.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user để xóa' });
    }

    return res.json({ success: true, message: 'Xóa thành công' });
  } catch (err) {
    console.error('Delete User Error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi xóa user' });
  }
};
