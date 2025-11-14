/**
 * ==================================================
 * authenticate Middleware
 * ==================================================
 * 
 * Purpose:
 *   Verifies JWT token from `Authorization: Bearer <token>` header.
 *   Attaches decoded user (`req.user`) with `userId` and `role`.
 *   Must be used before `authorizeRole`.
 * 
 * Usage:
 *   router.get('/profile', authenticate, (req, res) => { ... });
 * 
 * @returns {Function} Express middleware
 */
const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check for Bearer token
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request - using userId for consistency with new routes
    req.user = {
      userId: decoded.id || decoded.userId, // Support both 'id' and 'userId'
      id: decoded.id || decoded.userId,     // Keep both for backward compatibility
      role: decoded.role,
    };

    console.log(`🔐 Authenticated user: ${req.user.userId} (${req.user.role})`);
    next();
  } catch (err) {
    // Handle expired or invalid tokens
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized: Token expired" 
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized: Invalid token" 
      });
    }

    console.error("❌ JWT verification error:", err);
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: Token verification failed" 
    });
  }
};

module.exports = authenticate;