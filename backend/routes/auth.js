const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");

// Available roles
const AVAILABLE_ROLES = ["customer", "vendor", "technician", "admin", "supportstaff", "regulatoryofficer"];

/**
 * =================================
 * 1. GET ALL ROLES - TEMPORARY FIX
 * =================================
 * Returns all valid user roles for dropdown
 * GET /api/auth/roles
 * 
 * TEMPORARY: Returning array directly for frontend compatibility
 * Will change to { success: true, data: [] } later
 */
router.get("/roles", (req, res) => {
  try {
    // TEMPORARY FIX: Return array directly for frontend compatibility
    console.log("📋 Returning roles array directly for frontend compatibility");
    res.json(AVAILABLE_ROLES);
    
    // LATER: Use this format when frontend is updated
    // res.json({
    //   success: true,
    //   data: AVAILABLE_ROLES
    // });
  } catch (err) {
    console.error("Error fetching roles:", err);
    // Still return array even on error for frontend compatibility
    res.json(AVAILABLE_ROLES);
  }
});

// KEEP ALL YOUR OTHER ROUTES EXACTLY THE SAME...
// [Your existing register, login, profile routes remain unchanged]

/**
 * =================================
 * 2. REGISTER USER
 * =================================
 * POST /api/auth/register
 * Body: { name, email, password, role?, termsAccepted, privacyAccepted }
 */
router.post(
  "/register",
  [
    body("name")
      .trim()
      .isLength({ min: 2 })
      .withMessage("Name must be at least 2 characters long"),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please enter a valid email address"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long"),
    body("role")
      .optional()
      .isIn(AVAILABLE_ROLES)
      .withMessage("Invalid role selected"),
    body("termsAccepted")
      .isBoolean()
      .withMessage("Terms acceptance must be a boolean")
      .custom((value) => value === true)
      .withMessage("You must accept the Terms of Service"),
    body("privacyAccepted")
      .isBoolean()
      .withMessage("Privacy acceptance must be a boolean")
      .custom((value) => value === true)
      .withMessage("You must accept the Privacy Policy"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: "Validation failed",
        errors: errors.array() 
      });
    }

    const { name, email, password, role: inputRole, termsAccepted, privacyAccepted } = req.body;
    const role = (inputRole || "customer").trim().toLowerCase();

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          message: "Email already in use" 
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create new user
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role,
        termsAccepted: termsAccepted || false,
        privacyAccepted: privacyAccepted || false,
      });

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: newUser._id, 
          email: newUser.email, 
          role: newUser.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Success response
      res.status(201).json({
        success: true,
        message: "Registration successful!",
        token,
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
        },
      });
    } catch (err) {
      console.error("Register error:", err);
      
      // Handle MongoDB duplicate key error
      if (err.code === 11000) {
        return res.status(400).json({ 
          success: false,
          message: "Email already in use" 
        });
      }
      
      // Handle Mongoose validation errors
      if (err.name === 'ValidationError') {
        const validationErrors = Object.values(err.errors).map(error => error.message);
        return res.status(400).json({ 
          success: false,
          message: "Validation failed",
          errors: validationErrors 
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: "Server error during registration" 
      });
    }
  }
);

/**
 * =================================
 * 3. LOGIN USER
 * =================================
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail().withMessage("Invalid email"),
    body("password").exists().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: "Validation failed",
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    try {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid email or password" 
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(400).json({ 
          success: false,
          message: "Account is deactivated. Please contact support." 
        });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid email or password" 
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT
      const token = jwt.sign(
        { 
          id: user._id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Success
      res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ 
        success: false,
        message: "Server error during login" 
      });
    }
  }
);

/**
 * =================================
 * 4. GET USER PROFILE
 * =================================
 * GET /api/auth/profile
 */
router.get("/profile", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

/**
 * =================================
 * 5. UPDATE USER PROFILE
 * =================================
 * PUT /api/auth/profile
 */
router.put("/profile", authenticate, [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters long")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: "Validation failed",
      errors: errors.array() 
    });
  }

  try {
    const { name } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

/**
 * =================================
 * 6. ADMIN: GET ALL USERS
 * =================================
 * GET /api/auth/users
 */
router.get("/users", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

/**
 * =================================
 * 7. ADMIN: UPDATE USER ROLE
 * =================================
 * PUT /api/auth/users/:id/role
 */
router.put("/users/:id/role", authenticate, authorizeRole("admin"), [
  body("role")
    .isIn(AVAILABLE_ROLES)
    .withMessage("Invalid role")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: "Validation failed",
      errors: errors.array() 
    });
  }

  try {
    const { role } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      message: "User role updated successfully",
      data: user
    });
  } catch (err) {
    console.error("Update user role error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

/**
 * =================================
 * 8. ADMIN: TOGGLE USER ACTIVE STATUS
 * =================================
 * PUT /api/auth/users/:id/status
 */
router.put("/users/:id/status", authenticate, authorizeRole("admin"), [
  body("isActive")
    .isBoolean()
    .withMessage("isActive must be a boolean")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: "Validation failed",
      errors: errors.array() 
    });
  }

  try {
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (err) {
    console.error("Toggle user status error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

module.exports = router;