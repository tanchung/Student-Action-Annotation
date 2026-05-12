/**
 * Phase 2: Updated Auth Middleware (using PostgreSQL)
 * Token now contains user.id (string) instead of user._id (ObjectId)
 */

const jwt = require('jsonwebtoken');
const PGUserAdapter = require('../adapters/PGUserAdapter');

const JWT_SECRET = "KLTN_SECRET_KEY_123456"; // Must match controller

/**
 * 1. VERIFY TOKEN
 * Extracts user data from JWT token
 * Token now contains .id (string from PostgreSQL)
 */
exports.verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    
    console.log('🔐 Verify Token - Path:', req.path, 'Token:', token ? 'Present' : 'Missing');
    
    if (!token) {
        return res.status(403).json({ 
            success: false, 
            message: "Access denied (Missing token)" 
        });
    }

    try {
        // Token typically sent as "Bearer <token>", extract the token part
        const actualToken = token.startsWith("Bearer ") ? token.slice(7) : token;
        
        const decoded = jwt.verify(actualToken, JWT_SECRET);
        req.user = decoded; // Store user info in request
        // ✅ decoded.id is now a STRING (not ObjectId)
        console.log('✅ Token verified for user:', decoded.username, '(id:', decoded.id, ') role:', decoded.role);
        next();
    } catch (err) {
        console.log('❌ Token verification failed:', err.message);
        return res.status(401).json({ 
            success: false, 
            message: "Invalid or expired token" 
        });
    }
};

/**
 * 2. CHECK ADMIN ROLE
 */
exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ 
            success: false, 
            message: "Admin privileges required!" 
        });
    }
};

/**
 * 3. VERIFY USER EXISTS IN DATABASE
 * Optional: Verify that user still exists in PostgreSQL
 * Can be used for sensitive operations
 */
exports.verifyUserExists = async (req, res, next) => {
    try {
        const userId = req.user?.id;  // From JWT token (string)
        
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "User ID not found in token" 
            });
        }

        const user = await PGUserAdapter.findById(userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found in database" 
            });
        }

        if (!user.isEnabled) {
            return res.status(403).json({ 
                success: false, 
                message: "User account is disabled" 
            });
        }

        if (!user.nonLocked) {
            return res.status(403).json({ 
                success: false, 
                message: "User account is locked" 
            });
        }

        // Attach full user object to request
        req.user.dbUser = user;
        next();
    } catch (error) {
        console.error('❌ verifyUserExists error:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: "Server error during user verification" 
        });
    }
};

/**
 * 4. CHECK USER OWNS RESOURCE
 * Generic middleware to verify user owns a resource
 * Usage: router.delete('/videos/:id', verifyToken, ownsResource('video', 'uploader_id'))
 */
exports.ownsResource = (resourceType, ownerFieldName = 'uploader_id') => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;  // From JWT token (string)
            
            if (!userId) {
                return res.status(401).json({ 
                    success: false, 
                    message: "User ID not found in token" 
                });
            }

            // For now, attached ownership check will happen in individual controllers
            // This middleware just ensures user is authenticated
            // Controllers will verify uploader_id matches req.user.id
            req.resourceOwnerId = userId;
            next();
        } catch (error) {
            console.error('❌ ownsResource error:', error.message);
            return res.status(500).json({ 
                success: false, 
                message: "Server error" 
            });
        }
    };
};

/**
 * 5. PERMISSION LEVELS
 */
exports.isAdminOrOwner = (resourceOwnerCheck) => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;  // From JWT token (string)
            const userRole = req.user?.role;

            if (userRole === 'admin') {
                // Admins can do anything
                next();
            } else if (userId && resourceOwnerCheck) {
                // Check if user owns the resource
                const ownsIt = await resourceOwnerCheck(userId);
                if (ownsIt) {
                    next();
                } else {
                    return res.status(403).json({ 
                        success: false, 
                        message: "You don't have permission for this resource" 
                    });
                }
            } else {
                return res.status(403).json({ 
                    success: false, 
                    message: "Permission denied" 
                });
            }
        } catch (error) {
            console.error('❌ isAdminOrOwner error:', error.message);
            return res.status(500).json({ 
                success: false, 
                message: "Server error" 
            });
        }
    };
};
