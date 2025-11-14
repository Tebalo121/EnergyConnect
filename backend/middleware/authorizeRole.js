/**
 * ==================================================
 * authorizeRole Middleware
 * ==================================================
 * 
 * Restricts route access to users with specific roles.
 * Role comparison is **case-insensitive** and **trim-safe**.
 * 
 * Usage:
 *   router.get('/admin', authenticate, authorizeRole('admin'), handler);
 *   router.post('/manage', authenticate, authorizeRole('Admin', 'VENDOR'), handler);
 * 
 * @param {...string} allowedRoles - Roles allowed (any case)
 * @returns {Function} Express middleware
 */
const authorizeRole = (...allowedRoles) => {
  // Normalize allowed roles once (lowercase + trimmed)
  const allowed = allowedRoles.map(r => r?.trim().toLowerCase()).filter(Boolean);

  return (req, res, next) => {
    // Must be authenticated
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Authentication required",
      });
    }

    // Normalize user role
    const userRole = req.user.role.trim().toLowerCase();

    // Grant access if user role matches any allowed role
    if (!allowed.includes(userRole)) {
      const expected = allowed.length === 1
        ? `'${allowed[0]}'`
        : `one of: ${allowed.map(r => `'${r}'`).join(", ")}`;

      console.warn(`🚫 Access denied: User ${req.user.userId || req.user.id} (${req.user.role}) tried to access route requiring ${expected}`);
      
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access denied. Required role: ${expected}`,
      });
    }

    console.log(`✅ Role authorized: ${req.user.userId || req.user.id} (${req.user.role}) accessing route requiring ${allowed.join(', ')}`);
    next();
  };
};

module.exports = authorizeRole;