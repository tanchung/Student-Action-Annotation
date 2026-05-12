/**
 * Phase 2: Updated Auth Controller (using PostgreSQL)
 * Replaces Mongoose User queries with PGUserAdapter
 * 
 * Key changes:
 * - Import PGUserAdapter instead of Mongoose User
 * - JWT token now contains string user.id (not ObjectId)
 * - All password hashing/comparison uses PGUserAdapter
 */

const PGUserAdapter = require('../adapters/PGUserAdapter');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Key này phải khớp với key bên middleware
const JWT_SECRET = "KLTN_SECRET_KEY_123456"; 

/**
 * 1. REGISTER - Create new user in PostgreSQL
 */
exports.register = async (req, res) => {
    try {
        const { username, password, role, full_name, email } = req.body;

        // Validate input
        if (!username || !password || !email) {
            return res.status(400).json({ 
                success: false, 
                message: "Username, password, and email are required" 
            });
        }

        // Check if username already exists
        const existingUser = await PGUserAdapter.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: "Username already exists" 
            });
        }

        // Check if email already exists
        const emailExists = await PGUserAdapter.findOne({ email });
        if (emailExists) {
            return res.status(400).json({ 
                success: false, 
                message: "Email already exists" 
            });
        }

        // Generate new user ID (convert to string for VARCHAR 24)
        const { v4: uuidv4 } = require('uuid');
        let userId = uuidv4().replace(/-/g, '').slice(0, 24); // Use first 24 chars of UUID

        // Create new user
        const newUser = await PGUserAdapter.create({
            id: userId,
            username,
            password,  // PGUserAdapter.create will hash it
            role: role || 'user',
            full_name,
            email,
            isEnabled: true,
            nonLocked: true
        });

        res.status(201).json({ 
            success: true, 
            message: "Registration successful!",
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error during registration" 
        });
    }
};

/**
 * 2. LOGIN - Authenticate user from PostgreSQL
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: "Username and password are required" 
            });
        }

        // Find user in PostgreSQL
        const user = await PGUserAdapter.findOne({ username });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "Invalid username or password" 
            });
        }

        // Check if user is enabled
        if (!user.isEnabled) {
            return res.status(403).json({ 
                success: false, 
                message: "User account is disabled" 
            });
        }

        // Check if user is locked
        if (!user.nonLocked) {
            return res.status(403).json({ 
                success: false, 
                message: "User account is locked" 
            });
        }

        // Compare password
        const isMatch = await PGUserAdapter.comparePassword(user.password, password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid username or password" 
            });
        }

        // Create JWT token
        // NOTE: Token now contains .id (string from PostgreSQL)
        const token = jwt.sign(
            { 
                id: user.id,           // ✅ Changed from user._id to user.id (string)
                role: user.role, 
                username: user.username 
            },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        console.log(`✅ User logged in: ${username} (${user.id})`);

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error during login" 
        });
    }
};

/**
 * 3. LOGOUT
 */
exports.logout = async (req, res) => {
    try {
        // In stateless JWT, logout is handled by client removing token
        res.status(200).json({ 
            success: true, 
            message: "Logout successful" 
        });
    } catch (error) {
        console.error("Logout Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error during logout" 
        });
    }
};

/**
 * 4. CHANGE PASSWORD
 */
exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user.id;  // From JWT token (now string)

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: "Old password and new password are required" 
            });
        }

        // Find user
        const user = await PGUserAdapter.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // Verify old password
        const isMatch = await PGUserAdapter.comparePassword(user.password, oldPassword);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: "Old password is incorrect" 
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        // Update user
        await PGUserAdapter.findByIdAndUpdate(userId, {
            password: hashedNewPassword
        });

        console.log(`✅ Password changed for user: ${user.username}`);

        res.status(200).json({ 
            success: true, 
            message: "Password changed successfully" 
        });

    } catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error when changing password" 
        });
    }
};

/**
 * 5. GET CURRENT USER
 */
exports.getCurrentUser = async (req, res) => {
    try {
        const userId = req.user.id;  // From JWT token (now string)

        const user = await PGUserAdapter.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        res.status(200).json({
            success: true,
            result: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                email: user.email,
                dateOfBirth: user.dateOfBirth,
                nonLocked: user.nonLocked,
                isEnabled: user.isEnabled,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error("Get Current User Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error" 
        });
    }
};
