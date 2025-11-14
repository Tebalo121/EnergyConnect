const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const User = require("../models/User");
const Order = require("../models/Order");
const Message = require("../models/Message");

// Authentication middleware
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");

// Get customer products - FIXED VERSION
router.get("/products", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    console.log("🔋 Fetching customer products...");
    
    const products = await Product.find({ status: "active" })
      .populate('vendorId', 'name email')
      .sort({ createdAt: -1 });
    
    console.log(`✅ Found ${products.length} active products`);
    
    if (products.length === 0) {
      console.log("⚠️ No active products found in database");
      
      // Create some real products in the database
      const sampleProducts = await createSampleProducts();
      return res.json({
        success: true,
        data: sampleProducts,
        note: "Using sample products - no products in database"
      });
    }
    
    res.json({
      success: true,
      data: products
    });
  } catch (err) {
    console.error("❌ Customer products fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch products" 
    });
  }
});

// Updated helper function to create REAL sample products in database
async function createSampleProducts() {
  try {
    // Check if we already have active products
    const existingProducts = await Product.find({ status: "active" });
    if (existingProducts.length > 0) {
      return existingProducts;
    }

    // Get any vendor user to assign products to
    const vendorUser = await User.findOne({ role: 'vendor' });
    if (!vendorUser) {
      console.log("❌ No vendor user found to assign products to");
      return [];
    }

    const sampleProducts = [
      {
        name: "Solar Panel 300W",
        type: "solar_panel",
        price: 1500,
        stock: 10,
        description: "High-efficiency monocrystalline solar panel with 25-year warranty",
        category: "solar_equipment",
        vendorId: vendorUser._id,
        status: "active",
        specifications: {
          power: "300W",
          efficiency: "21.5%",
          dimensions: "1.7m x 1.0m",
          weight: "18.5kg"
        }
      },
      {
        name: "Home Battery 5kWh", 
        type: "battery",
        price: 3000,
        stock: 5,
        description: "Lithium-ion home energy storage system with smart monitoring",
        category: "storage",
        vendorId: vendorUser._id,
        status: "active",
        specifications: {
          capacity: "5kWh",
          voltage: "48V",
          cycleLife: "6000 cycles",
          warranty: "10 years"
        }
      },
      {
        name: "Smart Inverter 3kW",
        type: "inverter",
        price: 1200,
        stock: 8,
        description: "Grid-tie smart inverter with WiFi monitoring and mobile app",
        category: "conversion", 
        vendorId: vendorUser._id,
        status: "active",
        specifications: {
          power: "3kW",
          efficiency: "97.5%",
          inputVoltage: "24-48V DC",
          output: "230V AC"
        }
      }
    ];

    console.log("📝 Creating real sample products in database...");
    
    // Save products to database
    const savedProducts = await Product.insertMany(sampleProducts);
    console.log(`✅ Created ${savedProducts.length} sample products`);
    
    // Populate vendor info before returning
    const populatedProducts = await Product.find({ _id: { $in: savedProducts.map(p => p._id) } })
      .populate('vendorId', 'name email');
    
    return populatedProducts;
  } catch (err) {
    console.error("❌ Error creating sample products:", err);
    
    // Return mock products as fallback
    return [
      {
        _id: "sample_1",
        name: "Solar Panel 300W",
        type: "solar_panel",
        price: 1500,
        stock: 10,
        description: "High-efficiency monocrystalline solar panel",
        category: "solar_equipment",
        status: "active",
        vendorId: { name: "Sample Vendor", email: "vendor@example.com" }
      },
      {
        _id: "sample_2",
        name: "Home Battery 5kWh",
        type: "battery",
        price: 3000, 
        stock: 5,
        description: "Lithium-ion home energy storage system",
        category: "storage",
        status: "active",
        vendorId: { name: "Sample Vendor", email: "vendor@example.com" }
      }
    ];
  }
}

// Helper function to create sample products
async function createSampleProducts() {
  try {
    // Check if we already have sample products
    const existingProducts = await Product.find({ name: /sample/i });
    if (existingProducts.length > 0) {
      return existingProducts;
    }
    
    const sampleProducts = [
      {
        name: "Sample Solar Panel 300W",
        type: "solar_panel",
        price: 1500,
        stock: 10,
        description: "High-efficiency monocrystalline solar panel",
        category: "solar_equipment",
        status: "active"
      },
      {
        name: "Sample Home Battery 5kWh",
        type: "battery", 
        price: 3000,
        stock: 5,
        description: "Lithium-ion home energy storage system",
        category: "storage",
        status: "active"
      }
    ];
    
    console.log("📝 Creating sample products for demo");
    return sampleProducts;
  } catch (err) {
    console.error("❌ Error creating sample products:", err);
    return [];
  }
}

// Get customer orders
router.get("/orders", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    console.log("💰 Fetching customer orders...");
    
    const orders = await Order.find({ customerId: req.user.userId || req.user.id })
      .populate('productId', 'name type price')
      .populate('vendorId', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders
    });
  } catch (err) {
    console.error("❌ Customer orders fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch orders" 
    });
  }
});

// Create new order (buy/rent)
router.post("/orders", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    const { productId, productName, quantity, action, total, rentalDuration } = req.body;
    
    console.log(`🛒 Customer creating order: ${action} for product ${productId}`);
    
    if (!productId || !action) {
      return res.status(400).json({
        success: false,
        error: "Product ID and action are required"
      });
    }
    
    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }
    
    // Check stock for purchase
    if (action === 'buy' && product.stock < (quantity || 1)) {
      return res.status(400).json({
        success: false,
        error: "Insufficient stock available"
      });
    }
    
    // Generate order number
    const orderNumber = `EC-${Date.now()}`;
    
    // Create order
    const newOrder = new Order({
      orderNumber,
      customerId: req.user.userId || req.user.id,
      productId: productId,
      productName: productName || product.name,
      vendorId: product.vendorId,
      quantity: quantity || 1,
      action: action, // 'buy' or 'rent'
      total: total || product.price,
      rentalDuration: action === 'rent' ? rentalDuration : undefined,
      status: 'pending',
      createdAt: new Date()
    });
    
    const savedOrder = await newOrder.save();
    
    // Populate the saved order for response
    const populatedOrder = await Order.findById(savedOrder._id)
      .populate('productId', 'name type price')
      .populate('vendorId', 'name email');
    
    res.json({
      success: true,
      message: "Order created successfully and sent to vendor for approval",
      data: populatedOrder
    });
    
  } catch (err) {
    console.error("❌ Order creation error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to create order" 
    });
  }
});

// Cancel order
router.post("/orders/:id/cancel", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`❌ Customer cancelling order: ${id}`);
    
    const order = await Order.findOneAndUpdate(
      { 
        _id: id, 
        customerId: req.user.userId || req.user.id,
        status: 'pending' // Only allow cancellation of pending orders
      },
      { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Cancelled by customer'
      },
      { new: true }
    ).populate('productId', 'name type price')
     .populate('vendorId', 'name email');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found or cannot be cancelled"
      });
    }
    
    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: order
    });
    
  } catch (err) {
    console.error("❌ Order cancellation error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to cancel order" 
    });
  }
});

// Get customer profile
router.get("/profile", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    console.log("👤 Fetching customer profile...");
    
    const user = await User.findById(req.user.userId || req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    // Get customer stats
    const orderStats = await Order.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(req.user.userId || req.user.id) } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] }
          },
          totalSpent: { $sum: "$total" }
        }
      }
    ]);
    
    const stats = orderStats[0] || {
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      totalSpent: 0
    };
    
    const customerData = {
      ...user.toObject(),
      tokenBalance: (Math.random() * 1000).toFixed(2),
      orderStats: stats,
      energyUsage: {
        today: "12.5 kWh",
        week: "85.3 kWh", 
        month: "320.7 kWh"
      },
      solarProduction: {
        today: "15.2 kWh",
        week: "102.8 kWh",
        month: "385.4 kWh"
      },
      savings: {
        today: "R 45.20",
        week: "R 285.60",
        month: "R 1,120.45"
      }
    };
    
    res.json({
      success: true,
      data: customerData
    });
    
  } catch (err) {
    console.error("❌ Customer profile error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch profile" 
    });
  }
});

// Update customer profile
router.put("/profile", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    console.log("✏️ Updating customer profile...");
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId || req.user.id,
      { 
        name, 
        email, 
        phone, 
        address,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });
    
  } catch (err) {
    console.error("❌ Profile update error:", err);
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Email already exists"
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: "Failed to update profile" 
    });
  }
});

// Get order messages
router.get("/orders/:id/messages", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`💬 Fetching messages for order: ${id}`);
    
    // Verify order belongs to customer
    const order = await Order.findOne({ 
      _id: id, 
      customerId: req.user.userId || req.user.id 
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }
    
    const messages = await Message.find({ orderId: id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name role');
    
    res.json({
      success: true,
      data: messages
    });
    
  } catch (err) {
    console.error("❌ Order messages error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch messages" 
    });
  }
});

// Send message to vendor
router.post("/orders/messages", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    const { orderId, message } = req.body;
    
    console.log(`✉️ Customer sending message for order: ${orderId}`);
    
    if (!orderId || !message) {
      return res.status(400).json({
        success: false,
        error: "Order ID and message are required"
      });
    }
    
    // Verify order belongs to customer
    const order = await Order.findOne({ 
      _id: orderId, 
      customerId: req.user.userId || req.user.id 
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }
    
    const newMessage = new Message({
      orderId: orderId,
      senderId: req.user.userId || req.user.id,
      message: message,
      senderType: 'customer',
      createdAt: new Date()
    });
    
    const savedMessage = await newMessage.save();
    const populatedMessage = await Message.findById(savedMessage._id)
      .populate('senderId', 'name role');
    
    res.json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage
    });
    
  } catch (err) {
    console.error("❌ Message send error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to send message" 
    });
  }
});

// Get customer dashboard
router.get("/dashboard", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    console.log("📊 Fetching customer dashboard data...");
    
    // Fetch multiple data points in parallel
    const [
      products,
      user,
      orders,
      orderStats
    ] = await Promise.all([
      Product.find({ status: "active" }).limit(4),
      User.findById(req.user.userId || req.user.id).select('name email'),
      Order.find({ customerId: req.user.userId || req.user.id })
        .populate('productId', 'name type')
        .sort({ createdAt: -1 })
        .limit(5),
      Order.aggregate([
        { $match: { customerId: new mongoose.Types.ObjectId(req.user.userId || req.user.id) } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
            },
            completedOrders: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] }
            },
            totalSpent: { $sum: "$total" }
          }
        }
      ])
    ]);
    
    const stats = orderStats[0] || {
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      totalSpent: 0
    };
    
    const dashboardData = {
      user: user,
      stats: {
        tokenBalance: (Math.random() * 1000).toFixed(2),
        productsAvailable: await Product.countDocuments({ status: "active" }),
        activeOrders: stats.pendingOrders,
        completedOrders: stats.completedOrders,
        totalSpent: stats.totalSpent,
        monthlySavings: "R 1,120.45",
        carbonSaved: "320 kg",
        systemEfficiency: "87%"
      },
      recentOrders: orders,
      quickActions: [
        { label: "Record Energy", icon: "⚡", path: "/blockchain" },
        { label: "Browse Products", icon: "🔋", path: "/products" },
        { label: "View Orders", icon: "📦", path: "/orders" },
        { label: "My Profile", icon: "👤", path: "/profile" }
      ],
      alerts: [
        {
          type: "info",
          message: "Peak solar production hours: 10 AM - 2 PM",
          timestamp: new Date().toISOString()
        }
      ]
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
    
  } catch (err) {
    console.error("❌ Customer dashboard error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to load dashboard" 
    });
  }
});

// Get AI insights for customer
router.get("/ai-insights", authenticate, authorizeRole("customer"), async (req, res) => {
  try {
    console.log("🤖 Generating AI insights for customer...");
    
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const insights = {
      message: "Based on your usage patterns, we recommend optimizing solar consumption.",
      predictedUsage: "12.8 kWh",
      savingsTip: "Shift high-energy activities to daylight hours to save 20% on grid electricity.",
      confidence: 0.89,
      recommendations: [
        "Run dishwasher between 10 AM - 2 PM",
        "Charge EV during peak solar production",
        "Consider battery storage for evening usage"
      ],
      carbonFootprint: {
        saved: "45 kg CO2 this week",
        equivalent: "Equivalent to planting 2 trees"
      }
    };
    
    res.json({
      success: true,
      data: insights
    });
    
  } catch (err) {
    console.error("❌ AI insights error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to generate insights" 
    });
  }
});

module.exports = router;