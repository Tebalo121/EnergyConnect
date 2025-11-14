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

// Get vendor profile
router.get("/profile", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("👤 Fetching vendor profile...");
    
    const user = await User.findById(req.user.userId || req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Vendor not found"
      });
    }
    
    res.json({
      success: true,
      data: user
    });
    
  } catch (err) {
    console.error("❌ Vendor profile error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch vendor profile" 
    });
  }
});

// Get vendor products
router.get("/products", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("📦 Fetching vendor products...");
    
    const products = await Product.find({ vendorId: req.user.userId || req.user.id }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: products
    });
    
  } catch (err) {
    console.error("❌ Vendor products fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch vendor products" 
    });
  }
});

// Create vendor product - UPDATED VERSION
router.post("/products", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    const { name, price, type, stock, description, category } = req.body;
    
    console.log("🆕 Creating vendor product:", { name, type, price });
    
    if (!name || !price || !type || !stock) {
      return res.status(400).json({
        success: false,
        error: "Name, price, type, and stock are required"
      });
    }
    
    // Normalize the product type to match enum values
    const normalizedType = normalizeProductType(type);
    
    const newProduct = new Product({
      name: name.trim(),
      price: parseFloat(price),
      type: normalizedType,
      stock: parseInt(stock),
      description: description?.trim() || "",
      category: category || "solar_equipment",
      vendorId: req.user.userId || req.user.id,
      status: "active",
      createdAt: new Date()
    });
    
    const savedProduct = await newProduct.save();
    
    console.log("✅ Product created successfully:", savedProduct._id);
    
    res.json({
      success: true,
      message: "Product created successfully",
      data: savedProduct
    });
    
  } catch (err) {
    console.error("❌ Product creation error:", err);
    
    // Handle validation errors specifically
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

// Helper function to normalize product types
function normalizeProductType(type) {
  const typeMap = {
    // Solar panels
    'solar panel': 'solar_panel',
    'solar panels': 'solar_panel',
    'solar_panels': 'solar_panel',
    'Solar Panel': 'solar_panel',
    'Solar Panels': 'solar_panel',
    
    // Batteries
    'battery': 'battery',
    'batteries': 'battery',
    'Battery': 'battery',
    'Battery Storage': 'battery',
    
    // Inverters
    'inverter': 'inverter',
    'inverters': 'inverter',
    'Inverter': 'inverter',
    
    // Controllers
    'controller': 'controller',
    'controllers': 'controller',
    'Controller': 'controller',
    
    // Accessories
    'accessory': 'accessory',
    'accessories': 'accessory',
    'Accessory': 'accessory',
    
    // Water heating
    'water heating': 'Water Heating',
    'water_heating': 'Water Heating',
    'Water Heating': 'Water Heating'
  };
  
  const normalized = typeMap[type.toLowerCase()] || type;
  console.log(`🔄 Normalized product type: "${type}" -> "${normalized}"`);
  return normalized;
}
// Update vendor product
router.put("/products/:id", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, type, stock, description, category } = req.body;
    
    console.log("✏️ Updating vendor product:", id);
    
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, vendorId: req.user.userId || req.user.id },
      {
        name,
        price: parseFloat(price),
        type,
        stock: parseInt(stock),
        description,
        category,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found or access denied"
      });
    }
    
    res.json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct
    });
    
  } catch (err) {
    console.error("❌ Product update error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to update product" 
    });
  }
});

// Delete vendor product
router.delete("/products/:id", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log("🗑️ Deleting vendor product:", id);
    
    const deletedProduct = await Product.findOneAndDelete({
      _id: id,
      vendorId: req.user.userId || req.user.id
    });
    
    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found or access denied"
      });
    }
    
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

// Get vendor orders
router.get("/orders", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("💰 Fetching vendor orders...");
    
    const orders = await Order.find({ vendorId: req.user.userId || req.user.id })
      .populate('customerId', 'name email')
      .populate('productId', 'name type price')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders
    });
    
  } catch (err) {
    console.error("❌ Vendor orders fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch vendor orders" 
    });
  }
});

// Get pending approvals for vendor
router.get("/pending-approvals", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("⏳ Fetching pending approvals...");
    
    const pendingOrders = await Order.find({ 
      vendorId: req.user.userId || req.user.id,
      status: 'pending'
    })
    .populate('customerId', 'name email')
    .populate('productId', 'name type price')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: pendingOrders
    });
    
  } catch (err) {
    console.error("❌ Pending approvals error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch pending approvals" 
    });
  }
});

// Vendor approves/rejects order
router.post("/approve-order", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    const { orderId, action } = req.body; // action: 'approve' or 'reject'
    
    console.log(`🔄 Vendor ${action} order: ${orderId}`);
    
    if (!orderId || !action) {
      return res.status(400).json({
        success: false,
        error: "Order ID and action are required"
      });
    }
    
    const order = await Order.findOne({ 
      _id: orderId, 
      vendorId: req.user.userId || req.user.id 
    }).populate('productId');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found or access denied"
      });
    }
    
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: "Order is not in pending status"
      });
    }
    
    let updateData = {};
    
    if (action === 'approve') {
      // Check stock for purchase orders
      if (order.action === 'buy' && order.productId.stock < order.quantity) {
        return res.status(400).json({
          success: false,
          error: "Insufficient stock to approve this order"
        });
      }
      
      updateData.status = 'approved';
      updateData.approvedAt = new Date();
      
      // Update product stock for purchase orders
      if (order.action === 'buy') {
        await Product.findByIdAndUpdate(
          order.productId._id,
          { $inc: { stock: -order.quantity } }
        );
      }
      
    } else if (action === 'reject') {
      updateData.status = 'rejected';
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = req.body.reason || 'Rejected by vendor';
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid action. Must be 'approve' or 'reject'"
      });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true }
    )
    .populate('customerId', 'name email')
    .populate('productId', 'name type price')
    .populate('vendorId', 'name email');
    
    res.json({
      success: true,
      message: `Order ${action}d successfully`,
      data: updatedOrder
    });
    
  } catch (err) {
    console.error("❌ Order approval error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to process order approval" 
    });
  }
});

// Get vendor sales analytics
router.get("/sales-analytics", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("📈 Fetching vendor sales analytics...");
    
    // Generate mock sales data for now
    const monthlySales = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(2024, i).toLocaleString('default', { month: 'short' }),
      sales: Math.floor(Math.random() * 20000 + 10000),
      revenue: Math.floor(Math.random() * 50000 + 25000),
      orders: Math.floor(Math.random() * 20 + 10)
    }));
    
    res.json({
      success: true,
      data: monthlySales
    });
    
  } catch (err) {
    console.error("❌ Sales analytics error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch sales analytics" 
    });
  }
});

// Get AI insights for vendor
router.get("/ai-insights", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("🤖 Generating AI insights for vendor...");
    
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const insights = {
      inventoryTip: "Consider restocking Solar Panel 300W - current stock is below optimal level.",
      pricingStrategy: "Your pricing is competitive. Consider 5% increase for premium products.",
      expectedSales: "M45,000 expected this month based on current trends.",
      recommendations: [
        "Bundle solar panels with batteries for increased sales",
        "Offer seasonal discounts during winter months",
        "Expand product line to include monitoring systems"
      ],
      marketTrends: {
        solarDemand: "High",
        batteryGrowth: "Rapid",
        consumerInterest: "Increasing"
      }
    };
    
    res.json({
      success: true,
      data: insights
    });
    
  } catch (err) {
    console.error("❌ Vendor AI insights error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to generate AI insights" 
    });
  }
});

// Get vendor dashboard
router.get("/dashboard", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    console.log("📊 Fetching vendor dashboard data...");
    
    // Fetch multiple data points in parallel
    const [
      products,
      orders,
      user,
      pendingCount
    ] = await Promise.all([
      Product.find({ vendorId: req.user.userId || req.user.id }),
      Order.find({ vendorId: req.user.userId || req.user.id })
        .populate('customerId', 'name')
        .sort({ createdAt: -1 })
        .limit(5),
      User.findById(req.user.userId || req.user.id).select('name email'),
      Order.countDocuments({ 
        vendorId: req.user.userId || req.user.id,
        status: 'pending' 
      })
    ]);
    
    const completedOrders = await Order.countDocuments({ 
      vendorId: req.user.userId || req.user.id,
      status: 'approved' 
    });
    
    const dashboardData = {
      vendor: user,
      stats: {
        totalRevenue: 125000,
        productsListed: products.length,
        pendingOrders: pendingCount,
        completedOrders: completedOrders,
        customerSatisfaction: "94%",
        monthlyGrowth: "+12%"
      },
      recentOrders: orders,
      quickActions: [
        { label: "Add Product", icon: "📦", path: "/products" },
        { label: "Review Orders", icon: "💰", path: "/orders" },
        { label: "View Analytics", icon: "📊", path: "/analytics" },
        { label: "Check Approvals", icon: "⏳", path: "/approvals" }
      ],
      recentActivity: orders.slice(0, 3).map(order => 
        `New ${order.action} order from ${order.customerId?.name || 'Customer'}`
      )
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
    
  } catch (err) {
    console.error("❌ Vendor dashboard error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to load vendor dashboard" 
    });
  }
});

// Send message to customer
router.post("/orders/messages", authenticate, authorizeRole("vendor"), async (req, res) => {
  try {
    const { orderId, message } = req.body;
    
    console.log(`✉️ Vendor sending message for order: ${orderId}`);
    
    if (!orderId || !message) {
      return res.status(400).json({
        success: false,
        error: "Order ID and message are required"
      });
    }
    
    // Verify order belongs to vendor
    const order = await Order.findOne({ 
      _id: orderId, 
      vendorId: req.user.userId || req.user.id 
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found or access denied"
      });
    }
    
    const newMessage = new Message({
      orderId: orderId,
      senderId: req.user.userId || req.user.id,
      message: message,
      senderType: 'vendor',
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

module.exports = router;