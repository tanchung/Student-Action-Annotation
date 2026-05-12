/**
 * Phase 2: Updated User Controller (using PostgreSQL)
 * Replaces Mongoose User queries with PGUserAdapter
 */

const PGUserAdapter = require('../adapters/PGUserAdapter');
const { v4: uuidv4 } = require('uuid');

/**
 * 1. GET USERS LIST (with search, filter, pagination)
 */
exports.getUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      role = "all", 
      sortBy = "createdAt", 
      sortDir = "desc" 
    } = req.query;

    // Build filter
    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } }
      ];
    }
    if (role && role !== 'all') {
      filter.role = role;
    }

    // Get users
    const users = await PGUserAdapter.find(filter, {
      sortBy,
      sortDir,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Get total count
    const total = await PGUserAdapter.countDocuments(filter);

    // Return users without password
    const usersWithoutPassword = users.map(user => {
      const { password, ...rest } = user;
      return rest;
    });

    res.json({
      success: true,
      result: {
        content: usersWithoutPassword,
        page: {
          totalPages: Math.ceil(total / parseInt(limit)),
          totalElements: total,
          currentPage: parseInt(page)
        }
      }
    });

  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error when fetching users" 
    });
  }
};

/**
 * 2. GET USER BY ID
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await PGUserAdapter.findById(id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Remove password
    const { password, ...userWithoutPassword } = user;

    res.json({ 
      success: true, 
      result: userWithoutPassword 
    });

  } catch (error) {
    console.error("Get User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * 3. CREATE USER (Admin)
 */
exports.createUser = async (req, res) => {
  try {
    const { 
      username, 
      password, 
      email, 
      full_name, 
      role, 
      dateOfBirth, 
      nonLocked 
    } = req.body;

    // Validate required fields
    if (!username || !password || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "Username, password, and email are required" 
      });
    }

    // Check if username exists
    const existingUsername = await PGUserAdapter.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ 
        success: false, 
        message: "Username already exists!" 
      });
    }

    // Check if email exists
    const existingEmail = await PGUserAdapter.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        message: "Email already exists!" 
      });
    }

    // Generate new user ID
    let userId = uuidv4().replace(/-/g, '').slice(0, 24);

    // Create user
    const newUser = await PGUserAdapter.create({
      id: userId,
      username,
      password,
      email,
      full_name,
      role: role || "user",
      dateOfBirth: dateOfBirth || null,
      nonLocked: nonLocked !== false,
      isEnabled: true
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({ 
      success: true, 
      message: "User created successfully!",
      result: userWithoutPassword 
    });

  } catch (error) {
    console.error("Create User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error when creating user" 
    });
  }
};

/**
 * 4. UPDATE USER
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Security: Don't allow updating password, username, id via this endpoint
    delete updateData.password; 
    delete updateData.username; 
    delete updateData.id;
    delete updateData._id;

    // Update user
    const updatedUser = await PGUserAdapter.findByIdAndUpdate(id, updateData);

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Return user without password
    const { password, ...userWithoutPassword } = updatedUser;

    res.json({ 
      success: true, 
      message: "User updated successfully",
      result: userWithoutPassword 
    });

  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error when updating user" 
    });
  }
};

/**
 * 5. DELETE USER
 */
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedUser = await PGUserAdapter.findByIdAndDelete(id);

        if (!deletedUser) {
          return res.status(404).json({ 
            success: false, 
            message: "User not found" 
          });
        }

        res.json({ 
          success: true, 
          message: "User deleted successfully" 
        });

    } catch (error) {
        console.error("Delete User Error:", error);
        res.status(500).json({ 
          success: false, 
          message: "Server error when deleting user" 
        });
    }
};

/**
 * 6. LOCK USER ACCOUNT
 */
exports.lockUser = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedUser = await PGUserAdapter.findByIdAndUpdate(id, {
      nonLocked: false
    });

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "User account locked" 
    });

  } catch (error) {
    console.error("Lock User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * 7. UNLOCK USER ACCOUNT
 */
exports.unlockUser = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedUser = await PGUserAdapter.findByIdAndUpdate(id, {
      nonLocked: true
    });

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "User account unlocked" 
    });

  } catch (error) {
    console.error("Unlock User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * 8. ENABLE USER ACCOUNT
 */
exports.enableUser = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedUser = await PGUserAdapter.findByIdAndUpdate(id, {
      isEnabled: true
    });

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "User account enabled" 
    });

  } catch (error) {
    console.error("Enable User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * 9. DISABLE USER ACCOUNT
 */
exports.disableUser = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedUser = await PGUserAdapter.findByIdAndUpdate(id, {
      isEnabled: false
    });

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "User account disabled" 
    });

  } catch (error) {
    console.error("Disable User Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};
