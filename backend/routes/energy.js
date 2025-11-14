const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const EnergyRecord = require("../models/EnergyRecord");
const authenticate = require("../middleware/authenticate");

// Record energy production (stores in MongoDB and simulates blockchain)
router.post("/record", authenticate, async (req, res) => {
  try {
    const { energy, timestamp, source = "solar" } = req.body;
    
    console.log("⚡ Recording energy production...");

    if (!energy) {
      return res.status(400).json({
        success: false,
        error: "Energy value is required"
      });
    }

    // Create energy record
    const energyRecord = new EnergyRecord({
      userId: req.user.userId || req.user.id,
      energy: parseFloat(energy),
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      source: source,
      recordedAt: new Date(),
      // Simulate blockchain transaction data
      blockchainData: {
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        blockNumber: Math.floor(Math.random() * 10000) + 1000,
        gasUsed: Math.floor(Math.random() * 100000) + 21000,
        status: "confirmed",
        confirmedAt: new Date()
      }
    });

    const savedRecord = await energyRecord.save();

    console.log(`✅ Energy recorded: ${savedRecord.energy}kWh by user ${savedRecord.userId}`);
    console.log(`📝 Blockchain TX: ${savedRecord.blockchainData.txHash}`);

    res.json({
      success: true,
      message: "Energy recorded successfully and added to blockchain",
      data: savedRecord
    });

  } catch (err) {
    console.error("❌ Energy recording error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to record energy production"
    });
  }
});

// Get user's energy history
router.get("/history", authenticate, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    
    console.log("📊 Fetching energy history...");

    const energyRecords = await EnergyRecord.find({ 
      userId: req.user.userId || req.user.id 
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await EnergyRecord.countDocuments({ 
      userId: req.user.userId || req.user.id 
    });

    res.json({
      success: true,
      data: energyRecords,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total
      }
    });

  } catch (err) {
    console.error("❌ Energy history error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch energy history"
    });
  }
});

// Get latest energy record (for dashboard)
router.get("/latest", authenticate, async (req, res) => {
  try {
    console.log("🔍 Fetching latest energy record...");

    const latestRecord = await EnergyRecord.findOne({ 
      userId: req.user.userId || req.user.id 
    }).sort({ timestamp: -1 });

    res.json({
      success: true,
      data: latestRecord || null
    });

  } catch (err) {
    console.error("❌ Latest energy record error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch latest energy record"
    });
  }
});

// Get all energy records (Admin only - for blockchain monitoring)
router.get("/admin/records", authenticate, async (req, res) => {
  try {
    // Check if user is admin
    const User = require("../models/User");
    const user = await User.findById(req.user.userId || req.user.id);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin role required."
      });
    }

    const { limit = 100, page = 1, userId, date } = req.query;
    
    console.log("👑 Admin fetching all energy records...");

    let query = {};
    if (userId) query.userId = userId;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query.recordedAt = { $gte: startDate, $lt: endDate };
    }

    const energyRecords = await EnergyRecord.find(query)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await EnergyRecord.countDocuments(query);

    // Calculate statistics
    const stats = await EnergyRecord.aggregate([
      {
        $group: {
          _id: null,
          totalEnergy: { $sum: "$energy" },
          avgEnergy: { $avg: "$energy" },
          totalRecords: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          totalEnergy: 1,
          avgEnergy: 1,
          totalRecords: 1,
          uniqueUsers: { $size: "$uniqueUsers" }
        }
      }
    ]);

    const dailyStats = await EnergyRecord.aggregate([
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
      { $limit: 7 }
    ]);

    res.json({
      success: true,
      data: energyRecords,
      statistics: stats[0] || {
        totalEnergy: 0,
        avgEnergy: 0,
        totalRecords: 0,
        uniqueUsers: 0
      },
      dailyStats: dailyStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total
      }
    });

  } catch (err) {
    console.error("❌ Admin energy records error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch energy records"
    });
  }
});

// Get blockchain energy statistics (Admin only)
router.get("/admin/blockchain-stats", authenticate, async (req, res) => {
  try {
    // Check if user is admin
    const User = require("../models/User");
    const user = await User.findById(req.user.userId || req.user.id);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin role required."
      });
    }

    console.log("📈 Admin fetching blockchain statistics...");

    const totalRecords = await EnergyRecord.countDocuments();
    const totalEnergy = await EnergyRecord.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$energy" }
        }
      }
    ]);

    const userStats = await EnergyRecord.aggregate([
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

    const recentTransactions = await EnergyRecord.find()
      .populate('userId', 'name role')
      .sort({ 'blockchainData.confirmedAt': -1 })
      .limit(10);

    const blockchainStats = {
      totalRecords,
      totalEnergy: totalEnergy[0]?.total || 0,
      userStats,
      recentTransactions: recentTransactions.map(tx => ({
        id: tx._id,
        userId: tx.userId._id,
        userName: tx.userId.name,
        userRole: tx.userId.role,
        energy: tx.energy,
        timestamp: tx.timestamp,
        txHash: tx.blockchainData.txHash,
        blockNumber: tx.blockchainData.blockNumber,
        status: tx.blockchainData.status,
        confirmedAt: tx.blockchainData.confirmedAt
      })),
      networkInfo: {
        status: "connected",
        lastBlock: Math.max(...recentTransactions.map(tx => tx.blockchainData.blockNumber)),
        totalTransactions: totalRecords,
        averageGas: 45000,
        network: "EnergyConnect Blockchain"
      }
    };

    res.json({
      success: true,
      data: blockchainStats
    });

  } catch (err) {
    console.error("❌ Admin blockchain stats error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch blockchain statistics"
    });
  }
});

module.exports = router;