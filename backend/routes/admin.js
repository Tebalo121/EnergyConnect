const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

// Middleware
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");

// Models
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Message = require("../models/Message");

/**
 * =================================
 * ADMIN DASHBOARD - MONITORING ONLY
 * =================================
 * GET /api/admin/dashboard
 */
router.get("/dashboard", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    console.log("📊 Admin fetching dashboard data...");

    // Get all statistics in parallel
    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalProducts,
      totalOrders,
      pendingOrders,
      approvedOrders,
      rejectedOrders,
      recentUsers,
      recentOrders
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'approved' }),
      Order.countDocuments({ status: 'rejected' }),
      User.find().select("name email role createdAt").sort({ createdAt: -1 }).limit(5),
      Order.find()
        .populate("customerId", "name email")
        .populate("vendorId", "name email")
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    // Calculate revenue from approved orders
    const revenueData = await Order.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueData[0]?.total || 0;

    // Recent activity log
    const recentActivity = [
      `${totalUsers} total users in system`,
      `${totalProducts} products available`,
      `${totalOrders} transactions processed`,
      `${pendingOrders} orders pending vendor approval`,
      `M${totalRevenue} total revenue generated`
    ];

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalVendors,
          totalCustomers,
          totalProducts,
          totalOrders,
          pendingOrders,
          approvedOrders,
          rejectedOrders,
          totalRevenue
        },
        recentActivities: {
          users: recentUsers,
          orders: recentOrders,
          activity: recentActivity
        },
        systemStatus: {
          database: "Connected",
          blockchain: "Operational",
          api: "Running",
          uptime: process.uptime()
        }
      }
    });
  } catch (err) {
    console.error("❌ Admin dashboard error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to load dashboard data" 
    });
  }
});

/**
 * =================================
 * GET ALL USERS (with pagination)
 * =================================
 * GET /api/admin/users
 */
router.get("/users", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { page = 1, limit = 10, role = "", search = "" } = req.query;
    
    console.log("👥 Admin fetching users...");
    
    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total
      }
    });
  } catch (err) {
    console.error("❌ Admin get users error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch users" 
    });
  }
});

/**
 * =================================
 * DELETE USER PERMANENTLY
 * =================================
 * DELETE /api/admin/users/:id
 */
router.delete("/users/:id", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Admin deleting user: ${id}`);
    
    // Prevent admin from deleting themselves
    if (id === req.user.userId || id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete your own account"
      });
    }
    
    // Find user to check role
    const userToDelete = await User.findById(id);
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    // Prevent deletion of other admin users
    if (userToDelete.role === 'admin') {
      return res.status(400).json({
        success: false,
        error: "Cannot delete admin users"
      });
    }
    
    // Delete user and their associated data
    const deletedUser = await User.findByIdAndDelete(id);
    
    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    // Delete user's orders and messages
    await Order.deleteMany({ 
      $or: [
        { customerId: id },
        { vendorId: id }
      ] 
    });
    
    await Message.deleteMany({
      $or: [
        { senderId: id },
        { receiverId: id }
      ]
    });
    
    console.log(`✅ User ${id} permanently deleted from database`);
    
    res.json({
      success: true,
      message: "User permanently deleted from database",
      data: { _id: id, email: deletedUser.email }
    });
    
  } catch (err) {
    console.error("❌ User deletion error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete user" 
    });
  }
});

/**
 * =================================
 * UPDATE USER ROLE
 * =================================
 * PUT /api/admin/users/:id/role
 */
router.put("/users/:id/role", authenticate, authorizeRole("admin"), [
  body("role")
    .isIn(["customer", "vendor", "admin"])
    .withMessage("Invalid role. Must be: customer, vendor, or admin")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: "Validation failed",
      details: errors.array() 
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
        error: "User not found" 
      });
    }

    res.json({
      success: true,
      message: "User role updated successfully",
      data: user
    });
  } catch (err) {
    console.error("❌ Admin update user role error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to update user role" 
    });
  }
});

/**
 * =================================
 * GET ALL TRANSACTIONS (ORDERS) - MONITORING ONLY
 * =================================
 * GET /api/admin/transactions
 */
router.get("/transactions", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "", type = "" } = req.query;
    
    console.log("💰 Admin fetching transactions...");
    
    const query = {};
    if (status) query.status = status;
    if (type) query.action = type;

    const orders = await Order.find(query)
      .populate('customerId', 'name email')
      .populate('vendorId', 'name email')
      .populate('productId', 'name type price')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    // Calculate statistics
    const stats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: orders,
      stats: stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total
      }
    });
  } catch (err) {
    console.error("❌ Admin transactions error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch transactions" 
    });
  }
});

/**
 * =================================
 * GET TRANSACTION DETAILS - MONITORING ONLY
 * =================================
 * GET /api/admin/transactions/:id
 */
router.get("/transactions/:id", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📋 Admin fetching transaction details: ${id}`);
    
    const order = await Order.findById(id)
      .populate('customerId', 'name email phone address')
      .populate('vendorId', 'name email phone address')
      .populate('productId', 'name type price description specifications');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found"
      });
    }

    // Get order messages
    const messages = await Message.find({ orderId: id })
      .populate('senderId', 'name role')
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      data: {
        order,
        messages,
        note: "Admin monitoring only - cannot modify order status"
      }
    });
  } catch (err) {
    console.error("❌ Admin transaction details error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch transaction details" 
    });
  }
});

/**
 * =================================
 * GET ALL PRODUCTS
 * =================================
 * GET /api/admin/products
 */
router.get("/products", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { page = 1, limit = 20, type = "", status = "" } = req.query;
    
    console.log("📦 Admin fetching products...");
    
    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;

    const products = await Product.find(query)
      .populate('vendorId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(query);

    // Product statistics
    const productStats = await Product.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalStock: { $sum: '$stock' },
          avgPrice: { $avg: '$price' }
        }
      }
    ]);

    res.json({
      success: true,
      data: products,
      stats: productStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total
      }
    });
  } catch (err) {
    console.error("❌ Admin products error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch products" 
    });
  }
});

/**
 * =================================
 * CREATE PRODUCT (Admin can add products)
 * =================================
 * POST /api/admin/products
 */
router.post("/products", authenticate, authorizeRole("admin"), [
  body("name").notEmpty().withMessage("Product name is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("stock").isInt({ min: 0 }).withMessage("Stock must be a positive integer"),
  body("type").isIn(["solar_panel", "battery", "inverter", "controller", "accessory", "Water Heating"])
    .withMessage("Invalid product type")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: "Validation failed",
      details: errors.array() 
    });
  }

  try {
    const { name, price, type, stock, description, category, specifications } = req.body;
    
    console.log("🆕 Admin creating product:", { name, type, price });

    const newProduct = new Product({
      name: name.trim(),
      price: parseFloat(price),
      type: type,
      stock: parseInt(stock),
      description: description?.trim() || "",
      category: category || "solar_equipment",
      vendorId: req.user.userId || req.user.id, // Admin as vendor
      status: "active",
      specifications: specifications || {},
      createdAt: new Date()
    });
    
    const savedProduct = await newProduct.save();
    const populatedProduct = await Product.findById(savedProduct._id)
      .populate('vendorId', 'name email');

    console.log("✅ Product created successfully:", savedProduct._id);
    
    res.json({
      success: true,
      message: "Product created successfully",
      data: populatedProduct
    });
    
  } catch (err) {
    console.error("❌ Product creation error:", err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: "Failed to create product" 
    });
  }
});

/**
 * =================================
 * DELETE PRODUCT
 * =================================
 * DELETE /api/admin/products/:id
 */
router.delete("/products/:id", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Admin deleting product: ${id}`);
    
    const deletedProduct = await Product.findByIdAndDelete(id);
    
    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }
    
    // Also delete associated orders
    await Order.deleteMany({ productId: id });
    
    res.json({
      success: true,
      message: "Product deleted successfully",
      data: deletedProduct
    });
    
  } catch (err) {
    console.error("❌ Product deletion error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete product" 
    });
  }
});

/**
 * =================================
 * GET SYSTEM ANALYTICS
 * =================================
 * GET /api/admin/analytics
 */
router.get("/analytics", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    console.log("📈 Admin fetching analytics...");

    // Monthly user registration analytics
    const userAnalytics = await User.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Product statistics by type
    const productStats = await Product.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalStock: { $sum: "$stock" },
          avgPrice: { $avg: "$price" }
        }
      }
    ]);

    // Order statistics with revenue
    const orderStats = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalRevenue: { $sum: "$total" },
          avgOrderValue: { $avg: "$total" }
        }
      }
    ]);

    // Monthly revenue
    const monthlyRevenue = await Order.aggregate([
      {
        $match: { status: 'approved' }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        userAnalytics,
        productStats,
        orderStats,
        monthlyRevenue,
        systemHealth: {
          database: "Connected",
          blockchain: "Operational",
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date()
        }
      }
    });
  } catch (err) {
    console.error("❌ Admin analytics error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch analytics" 
    });
  }
});

/**
 * =================================
 * GET SECURITY & COMPLIANCE DATA
 * =================================
 * GET /api/admin/security
 */
router.get("/security", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    console.log("🔒 Admin fetching security data...");

    // Data classification counts
    const userDataCount = await User.countDocuments();
    const productDataCount = await Product.countDocuments();
    const orderDataCount = await Order.countDocuments();

    // Recent security events (mock data for now)
    const securityEvents = [
      {
        id: 1,
        action: 'admin_login',
        user: 'System Admin',
        ip: '192.168.1.100',
        timestamp: new Date(),
        status: 'success'
      },
      {
        id: 2,
        action: 'user_deletion',
        user: 'customer_123',
        ip: '192.168.1.100',
        timestamp: new Date(Date.now() - 3600000),
        status: 'success'
      },
      {
        id: 3,
        action: 'product_creation',
        user: 'System Admin',
        ip: '192.168.1.100',
        timestamp: new Date(Date.now() - 7200000),
        status: 'success'
      }
    ];

    const complianceStatus = {
      gdpr: {
        dataEncryption: true,
        userConsent: true,
        rightToErasure: true,
        dataPortability: true,
        lastAudit: new Date('2024-01-15')
      },
      dataClassification: {
        public: ['product_catalog', 'energy_statistics'],
        private: ['user_profiles', 'transaction_history'],
        confidential: ['api_keys', 'database_credentials'],
        restricted: ['admin_access', 'security_configurations']
      }
    };

    res.json({
      success: true,
      data: {
        securityEvents,
        complianceStatus,
        dataCounts: {
          users: userDataCount,
          products: productDataCount,
          orders: orderDataCount
        },
        systemInfo: {
          sslEnabled: true,
          twoFactorAuth: true,
          auditLogging: true,
          lastSecurityScan: new Date('2024-01-10')
        }
      }
    });
  } catch (err) {
    console.error("❌ Admin security data error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch security data" 
    });
  }
});

/**
 * =================================
 * GET AI ANALYTICS DATA
 * =================================
 * GET /api/admin/ai-analytics
 */
router.get("/ai-analytics", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    console.log("🤖 Admin fetching AI analytics...");

    // Mock AI model performance data
    const modelPerformance = {
      accuracy: 87.5,
      saturationLevel: 72,
      trainingDataSize: 1250,
      predictionSuccessRate: 95,
      lastTraining: new Date('2024-01-12'),
      modelVersion: '1.2.0'
    };

    const energyPredictions = {
      today: {
        predicted: '15.2 kWh',
        actual: '14.8 kWh',
        accuracy: '97.3%'
      },
      week: {
        predicted: '102.8 kWh',
        actual: '98.5 kWh',
        accuracy: '95.8%'
      },
      month: {
        predicted: '385.4 kWh',
        actual: null,
        confidence: '89.2%'
      }
    };

    const recommendations = [
      "Optimize solar panel placement for increased efficiency",
      "Consider battery storage for peak hour usage",
      "Implement smart inverter technology",
      "Expand product line to include monitoring systems"
    ];

    res.json({
      success: true,
      data: {
        modelPerformance,
        energyPredictions,
        recommendations,
        datasetInfo: {
          totalRecords: 1250,
          features: ['timestamp', 'energy_produced', 'temperature', 'hour', 'day_of_week'],
          lastUpdate: new Date('2024-01-14')
        }
      }
    });
  } catch (err) {
    console.error("❌ Admin AI analytics error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch AI analytics" 
    });
  }
});

/**
 * =================================
 * GET BLOCKCHAIN ENERGY RECORDS
 * =================================
 * GET /api/admin/blockchain/energy-records
 */
router.get("/blockchain/energy-records", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, startDate, endDate } = req.query;
    
    console.log("⛓️ Admin fetching blockchain energy records...");

    let query = {};
    
    if (userId) {
      query.userId = mongoose.Types.ObjectId(userId);
    }
    
    if (startDate || endDate) {
      query.recordedAt = {};
      if (startDate) query.recordedAt.$gte = new Date(startDate);
      if (endDate) query.recordedAt.$lte = new Date(endDate);
    }

    const energyRecords = await EnergyRecord.find(query)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await EnergyRecord.countDocuments(query);

    // Get statistics
    const stats = await EnergyRecord.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalEnergy: { $sum: "$energy" },
          totalRecords: { $sum: 1 },
          avgEnergy: { $avg: "$energy" },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          totalEnergy: 1,
          totalRecords: 1,
          avgEnergy: 1,
          uniqueUsers: { $size: "$uniqueUsers" }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        records: energyRecords,
        statistics: stats[0] || {
          totalEnergy: 0,
          totalRecords: 0,
          avgEnergy: 0,
          uniqueUsers: 0
        }
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total
      }
    });

  } catch (err) {
    console.error("❌ Admin blockchain energy records error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch blockchain energy records" 
    });
  }
});

/**
 * =================================
 * GET BLOCKCHAIN ENERGY STATISTICS
 * =================================
 * GET /api/admin/blockchain/energy-stats
 */
router.get("/blockchain/energy-stats", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    console.log("📊 Admin fetching blockchain energy statistics...");

    // Daily energy production for last 30 days
    const dailyProduction = await EnergyRecord.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$recordedAt" }
          },
          totalEnergy: { $sum: "$energy" },
          recordCount: { $sum: 1 },
          avgEnergy: { $avg: "$energy" }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    // Energy production by user role
    const productionByRole = await EnergyRecord.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $group: {
          _id: "$user.role",
          totalEnergy: { $sum: "$energy" },
          recordCount: { $sum: 1 },
          avgEnergy: { $avg: "$energy" }
        }
      }
    ]);

    // Energy sources distribution
    const productionBySource = await EnergyRecord.aggregate([
      {
        $group: {
          _id: "$source",
          totalEnergy: { $sum: "$energy" },
          recordCount: { $sum: 1 }
        }
      }
    ]);

    // Recent blockchain transactions
    const recentTransactions = await EnergyRecord.find()
      .populate('userId', 'name role')
      .sort({ 'blockchainData.confirmedAt': -1 })
      .limit(20)
      .select('energy timestamp source blockchainData userId');

    res.json({
      success: true,
      data: {
        dailyProduction,
        productionByRole,
        productionBySource,
        recentTransactions,
        summary: {
          totalEnergyRecords: await EnergyRecord.countDocuments(),
          totalEnergyProduced: await EnergyRecord.aggregate([
            { $group: { _id: null, total: { $sum: "$energy" } } }
          ]).then(result => result[0]?.total || 0),
          averageDailyEnergy: dailyProduction.reduce((sum, day) => sum + day.totalEnergy, 0) / dailyProduction.length,
          uniqueEnergyProducers: await EnergyRecord.distinct('userId').then(users => users.length)
        }
      }
    });

  } catch (err) {
    console.error("❌ Admin blockchain energy stats error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch blockchain energy statistics" 
    });
  }
});

/**
 * =================================
 * GET BLOCKCHAIN STATUS
 * =================================
 * GET /api/admin/blockchain-status
 */
router.get("/blockchain-status", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    console.log("⛓️ Admin fetching blockchain status...");

    // Mock blockchain status (replace with actual blockchain integration)
    const blockchainStatus = {
      status: "connected",
      network: "EnergyConnect Blockchain",
      blockNumber: 12456,
      chainId: "energy_123",
      contractAddress: "0x742EfAb56dE13a78e865f76692cE8b9c9cF568c1",
      lastBlockTime: new Date(),
      nodeCount: 12,
      transactionCount: 3456,
      energyRecords: 892
    };

    const recentBlocks = Array.from({ length: 5 }, (_, i) => ({
      blockNumber: blockchainStatus.blockNumber - i,
      timestamp: new Date(Date.now() - i * 60000),
      transactionCount: Math.floor(Math.random() * 10) + 1,
      hash: `0x${Math.random().toString(16).substr(2, 64)}`
    }));

    res.json({
      success: true,
      data: {
        blockchainStatus,
        recentBlocks,
        networkHealth: {
          status: "healthy",
          latency: "45ms",
          peers: 12,
          syncStatus: "fully_synced"
        }
      }
    });
  } catch (err) {
    console.error("❌ Admin blockchain status error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch blockchain status" 
    });
  }
});

module.exports = router;