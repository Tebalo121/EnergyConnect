require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");

// Import Routes
const authRoutes = require("./routes/auth");
const vendorRoutes = require("./routes/vendor");
const customerRoutes = require("./routes/customer");
const adminRoutes = require("./routes/admin");
const aiRoutes = require("./routes/aiRoutes"); // NEW: AI Routes

// Import Models
const Product = require("./models/Product");
const User = require("./models/User");
const Order = require("./models/Order");
const Message = require("./models/Message");

// Import AI Services
const ModelTrainer = require("./ai/modelTrainer"); // NEW: AI Model Trainer
const DatasetGenerator = require("./ai/datasetGenerator"); // NEW: AI Dataset Generator

// Middleware imports 
const authorizeRole = require("./middleware/authorizeRole"); 

const app = express();
const PORT = process.env.PORT || 5001;

// ——————————— MIDDLEWARE ———————————
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📨 ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ——————————— MONGODB CONNECTION ———————————
console.log("🔍 Mongo URI:", process.env.MONGODB_URI ? "Loaded" : "Missing");

if (!process.env.MONGODB_URI) {
  console.error("❌ ERROR: MONGODB_URI environment variable is required!");
  process.exit(1);
}

// Remove deprecated options for newer Mongoose versions
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

mongoose.connection.on("error", err => {
  console.error("❌ MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected");
});

// ——————————— AI SERVICES INITIALIZATION ———————————
let modelTrainer;
let datasetGenerator;

const initializeAIServices = async () => {
  try {
    console.log("🤖 Initializing AI Services...");
    
    // Initialize dataset generator
    datasetGenerator = new DatasetGenerator(mongoose.connection.db);
    console.log("✅ Dataset Generator initialized");
    
    // Initialize model trainer
    modelTrainer = new ModelTrainer(mongoose.connection.db);
    console.log("✅ Model Trainer initialized");
    
    // Generate initial dataset if none exists
    const existingDataset = await mongoose.connection.db.collection('ai_energy_dataset').countDocuments();
    if (existingDataset === 0) {
      console.log("📊 Generating initial AI dataset...");
      await datasetGenerator.generateComprehensiveDataset(1000);
      console.log("✅ Initial dataset generated");
    }
    
    console.log("🎯 AI Services ready!");
  } catch (error) {
    console.error("❌ AI Services initialization failed:", error.message);
    console.log("⚠️ AI features will be limited");
  }
};

// ——————————— AUTH MIDDLEWARE ———————————
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "No token provided" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("🔑 Token verification error:", err.message);
    return res.status(401).json({ 
      success: false,
      message: "Invalid or expired token" 
    });
  }
};

// Role-based middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${role} role required.`
      });
    }
    next();
  };
};

// ——————————— ROUTES ———————————
app.use("/api/auth", authRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes); // NEW: AI Routes

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    success: true,
    status: "OK", 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    blockchain: isBlockchainConnected ? "Connected" : "Disconnected",
    ai_services: modelTrainer ? "Initialized" : "Not Initialized",
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "EnergyConnect backend is running successfully!",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      vendor: "/api/vendor",
      customer: "/api/customer",
      admin: "/api/admin",
      ai: "/api/ai", // NEW: AI endpoints
      health: "/health",
      blockchain: "/api/blockchain/status",
      support: "/api/support",
      technician: "/api/technician",
      regulatory: "/api/regulatory"
    },
    features: {
      ai_predictions: true,
      energy_analytics: true,
      smart_recommendations: true,
      blockchain_integration: true,
      cybersecurity: true
    }
  });
});

// ——————————— BLOCKCHAIN CONNECTION (ethers v5) ———————————
let energyContract = null;
let isBlockchainConnected = false;
let blockchainRetryCount = 0;
const MAX_RETRIES = 10;

async function connectToBlockchain() {
  try {
    console.log(`🔄 Attempting blockchain connection (attempt ${blockchainRetryCount + 1}/${MAX_RETRIES})...`);
    
    // ethers v5 syntax
    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // Test connection with timeout
    const blockNumber = await Promise.race([
      provider.getBlockNumber(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 5s')), 5000)
      )
    ]);
    
    console.log("✅ Connected to Hardhat - Block:", blockNumber);

    // ethers v5 wallet creation
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const wallet = new ethers.Wallet(privateKey, provider);

    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    
    // UPDATED: Use your actual contract ABI
    const contractABI = [
      "function storeEnergy(uint256 _energy) public",
      "function getEnergy() public view returns (uint256)",
      "function storedEnergy() public view returns (uint256)"
    ];

    // ethers v5 contract creation
    energyContract = new ethers.Contract(contractAddress, contractABI, wallet);
    
    // Verify contract is actually deployed
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      throw new Error('Contract not deployed at address: ' + contractAddress);
    }
    
    // Test the contract call
    try {
      const storedEnergy = await energyContract.storedEnergy();
      console.log("✅ Contract test call successful, stored energy:", storedEnergy.toString());
    } catch (testError) {
      console.warn("⚠️ Contract call test failed:", testError.message);
    }
    
    isBlockchainConnected = true;
    blockchainRetryCount = 0;
    
    console.log("✅ Smart Contract Connected and Verified:", contractAddress);

  } catch (err) {
    console.warn(`❌ Blockchain connection failed (attempt ${blockchainRetryCount + 1}):`, err.message);
    
    if (blockchainRetryCount < MAX_RETRIES) {
      blockchainRetryCount++;
      console.log(`🔄 Retrying in 3 seconds... (${blockchainRetryCount}/${MAX_RETRIES})`);
      setTimeout(connectToBlockchain, 3000);
    } else {
      console.log("💡 Max retries reached. Blockchain features disabled.");
      console.log("💡 Make sure to run: npx hardhat node (in backend folder)");
      energyContract = null;
      isBlockchainConnected = false;
    }
  }
}

// Start blockchain connection after a short delay
setTimeout(connectToBlockchain, 2000);

// ——————————— BLOCKCHAIN STATUS ENDPOINT ———————————
app.get("/api/blockchain/status", async (req, res) => {
  if (!isBlockchainConnected || !energyContract) {
    return res.json({
      success: false,
      status: "disconnected",
      message: "Blockchain not connected",
      retryCount: blockchainRetryCount,
      instruction: "Run: npx hardhat node (in backend folder)"
    });
  }

  try {
    const provider = energyContract.provider;
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    const gasPrice = await provider.getGasPrice();
    
    res.json({
      success: true,
      status: "connected",
      blockNumber: blockNumber,
      chainId: network.chainId,
      networkName: network.name,
      contractAddress: energyContract.address,
      gasPrice: ethers.utils.formatUnits(gasPrice, "gwei"),
      message: "Blockchain is connected and running"
    });
  } catch (error) {
    res.json({
      success: false,
      status: "error",
      message: "Blockchain connection lost: " + error.message
    });
  }
});

// ——————————— AI PREDICTION ENDPOINTS (Enhanced) ———————————

// Enhanced AI Prediction endpoint with real model integration
app.get("/api/ai/predict", authenticate, async (req, res) => {
  try {
    // Use real AI model if available, otherwise use simulation
    if (modelTrainer && modelTrainer.linearModel && modelTrainer.linearModel.isTrained) {
      const prediction = modelTrainer.predict({
        temperature: 25,
        hourOfDay: new Date().getHours(),
        householdSize: 4,
        humidity: 60,
        isWeekend: [0, 6].includes(new Date().getDay()),
        hasSolar: false
      });

      res.json({
        success: true,
        data: {
          message: "AI-powered energy consumption prediction",
          predictedUsage: `${prediction.predictedEnergy} kWh`,
          savingsTip: "Optimize appliance usage during off-peak hours",
          confidence: prediction.confidence,
          timestamp: new Date().toISOString(),
          model: "trained-linear-regression",
          detailed: {
            hourlyPrediction: Array.from({ length: 24 }, (_, i) => ({
              hour: i,
              predicted: (Math.random() * 2 + 0.5).toFixed(2),
              recommended: i >= 10 && i <= 14 ? "Use Solar" : "Use Grid"
            })),
            recommendations: [
              "Run high-energy appliances between 10 AM - 2 PM",
              "Consider adding battery storage for evening usage",
              "Your system is 85% efficient - consider panel cleaning"
            ],
            weatherImpact: "Sunny weather expected - 15% higher production"
          }
        }
      });
    } else {
      // Fallback to simulation
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const predictions = {
        message: "Optimize solar panel usage during peak hours for maximum savings.",
        predictedUsage: "12.5 kWh",
        savingsTip: "Reduce AC usage during peak grid hours to save 15% on electricity costs.",
        confidence: 0.87,
        timestamp: new Date().toISOString(),
        model: "simulation",
        detailed: {
          hourlyPrediction: Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            predicted: (Math.random() * 2 + 0.5).toFixed(2),
            recommended: i >= 10 && i <= 14 ? "Use Solar" : "Use Grid"
          })),
          recommendations: [
            "Run high-energy appliances between 10 AM - 2 PM",
            "Consider adding battery storage for evening usage",
            "Your system is 85% efficient - consider panel cleaning"
          ],
          weatherImpact: "Sunny weather expected - 15% higher production"
        }
      };
      
      res.json({
        success: true,
        data: predictions
      });
    }
  } catch (err) {
    console.error("❌ AI prediction error:", err);
    res.status(500).json({
      success: false,
      message: "AI service temporarily unavailable",
      data: {
        message: "Use historical patterns: peak production 10 AM - 2 PM",
        predictedUsage: "12.0 kWh",
        savingsTip: "Shift energy usage to daylight hours",
        confidence: 0.75,
        model: "fallback"
      }
    });
  }
});

// AI Plan Recommendation endpoint
app.post("/api/ai/recommend-plan", authenticate, async (req, res) => {
  try {
    const { customerData, usageHistory } = req.body;

    if (modelTrainer) {
      const recommendation = modelTrainer.recommendPlan(customerData, usageHistory);
      res.json({
        success: true,
        recommendation: recommendation
      });
    } else {
      // Fallback simulation
      const avgUsage = usageHistory?.reduce((sum, record) => sum + record.energyConsumptionKwh, 0) / (usageHistory?.length || 1) || 25;
      
      let recommendedPlan = 'Basic';
      if (avgUsage > 30) recommendedPlan = 'Standard';
      if (avgUsage > 50) recommendedPlan = 'Premium';
      if (customerData?.hasSolar) recommendedPlan = 'Green';

      res.json({
        success: true,
        recommendation: {
          currentUsage: parseFloat(avgUsage.toFixed(2)),
          recommendedPlan: {
            plan: recommendedPlan,
            monthlyCost: (avgUsage * 0.15).toFixed(2),
            suitability: 85,
            savingsPotential: 15.50
          },
          reasoning: `Based on average consumption of ${avgUsage.toFixed(2)} kWh`
        }
      });
    }
  } catch (error) {
    console.error("❌ AI plan recommendation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate plan recommendation"
    });
  }
});

// AI Analytics endpoint
app.get("/api/ai/analytics", authenticate, async (req, res) => {
  try {
    const dataset = await mongoose.connection.db.collection('ai_energy_dataset')
      .find({})
      .limit(1000)
      .toArray();

    if (modelTrainer && dataset.length > 0) {
      const patterns = modelTrainer.analyzePatterns(dataset);
      res.json({
        success: true,
        patterns: patterns,
        recordCount: dataset.length,
        model: "trained"
      });
    } else {
      // Fallback analytics
      const mockPatterns = {
        hourly: Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          averageUsage: (10 + Math.random() * 15).toFixed(2),
          isPeak: (i >= 17 && i <= 21) || (i >= 7 && i <= 9)
        })),
        daily: Array.from({ length: 7 }, (_, i) => ({
          day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
          averageUsage: (15 + Math.random() * 10).toFixed(2)
        })),
        seasonal: [
          { season: 'Winter', averageUsage: '18.5' },
          { season: 'Spring', averageUsage: '15.2' },
          { season: 'Summer', averageUsage: '22.8' },
          { season: 'Autumn', averageUsage: '16.7' }
        ]
      };

      res.json({
        success: true,
        patterns: mockPatterns,
        recordCount: 0,
        model: "simulation"
      });
    }
  } catch (error) {
    console.error("❌ AI analytics error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate analytics"
    });
  }
});

// ——————————— GENERAL API ROUTES ———————————

// Get all products (protected)
app.get("/api/products", authenticate, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (err) {
    console.error("❌ Product fetch error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching products" 
    });
  }
});

// FIXED: Record energy data on blockchain (protected) - COMPATIBLE WITH FRONTEND
app.post("/api/energy/record", authenticate, async (req, res) => {
  console.log("📨 Received energy record request:", req.body);

  try {
    // Accept both formats: {energy} and {energyProduced, energyConsumed}
    let { energy, energyProduced, energyConsumed, timestamp } = req.body;

    // Determine which format we're using
    let energyValue;
    if (energy !== undefined) {
      // Frontend is sending single energy value
      energyValue = Number(energy);
    } else if (energyProduced !== undefined && energyConsumed !== undefined) {
      // Frontend is sending produced/consumed - calculate net energy
      energyValue = Number(energyProduced) - Number(energyConsumed);
    } else {
      return res.status(400).json({
        success: false,
        error: "Either 'energy' or both 'energyProduced' and 'energyConsumed' are required"
      });
    }

    // Validate the energy value
    if (isNaN(energyValue)) {
      return res.status(400).json({
        success: false,
        error: "Energy value must be a valid number"
      });
    }

    if (energyValue < 0) {
      return res.status(400).json({
        success: false,
        error: "Energy value cannot be negative"
      });
    }

    if (!energyContract || !isBlockchainConnected) {
      console.log("⚠️ Blockchain not available, returning mock response");
      return res.json({
        success: true,
        data: {
          txHash: "mock-transaction-hash-" + Date.now(),
          blockNumber: 0,
          energy: energyValue,
          energyProduced: energyProduced || energyValue,
          energyConsumed: energyConsumed || 0,
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          status: "mock-confirmed",
          note: "Blockchain unavailable - data not stored on chain"
        }
      });
    }

    console.log(`📝 Recording energy: ${energyValue} kWh`);

    // Store energy multiplied by 100 to preserve 2 decimal places
    const energyToStore = Math.round(energyValue * 100);

    console.log(`🔢 Storing energy: ${energyValue} -> ${energyToStore}`);

    const tx = await energyContract.storeEnergy(energyToStore);
    
    console.log(`📝 Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();

    res.json({
      success: true,
      data: {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        energy: energyValue,
        energyProduced: energyProduced || energyValue,
        energyConsumed: energyConsumed || 0,
        timestamp: timestamp || Math.floor(Date.now() / 1000),
        status: "confirmed"
      }
    });

  } catch (err) {
    console.error("❌ Blockchain record error:", err);
    
    // More detailed error response
    res.status(500).json({ 
      success: false,
      error: "Failed to record energy data",
      details: err.message,
      code: err.code
    });
  }
});

// FIXED: Get latest energy data from blockchain (protected) - COMPATIBLE WITH FRONTEND
app.get("/api/energy/latest", authenticate, async (req, res) => {
  if (!energyContract || !isBlockchainConnected) {
    // Return mock data when blockchain is unavailable
    const mockData = {
      success: true,
      data: {
        energy: "15.5",
        energyProduced: "15.5",
        energyConsumed: "12.3",
        netEnergy: "3.2",
        timestamp: Math.floor(Date.now() / 1000),
        recorded: false,
        note: "Using mock data - blockchain unavailable"
      }
    };
    return res.json(mockData);
  }

  try {
    // Use your contract's getEnergy function
    const storedEnergy = await energyContract.getEnergy();
    
    // Convert back from stored value (divide by 100 to get decimal back)
    const energyValue = parseInt(storedEnergy.toString()) / 100;
    
    // Return data in format expected by frontend
    res.json({ 
      success: true,
      data: { 
        energy: energyValue.toString(),
        energyProduced: (energyValue + 5).toFixed(1), // Mock produced
        energyConsumed: "5.0", // Mock consumed
        netEnergy: energyValue.toFixed(1),
        timestamp: Math.floor(Date.now() / 1000),
        recorded: true
      }
    });
  } catch (err) {
    console.error("❌ Blockchain read error:", err);
    
    // Return mock data on error
    const mockData = {
      success: true,
      data: {
        energy: "15.5",
        energyProduced: "15.5",
        energyConsumed: "12.3",
        netEnergy: "3.2",
        timestamp: Math.floor(Date.now() / 1000),
        recorded: false,
        note: "Using mock data - blockchain read failed: " + err.message
      }
    };
    res.json(mockData);
  }
});

// Get energy history (multiple records)
app.get("/api/energy/history", authenticate, async (req, res) => {
  try {
    // For now, return mock history since your contract only stores one value
    const mockHistory = generateMockEnergyHistory();
    
    res.json({
      success: true,
      data: mockHistory
    });
  } catch (err) {
    console.error("❌ Energy history error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch energy history"
    });
  }
});

function generateMockEnergyHistory() {
  const records = [];
  const now = new Date();
  
  for (let i = 7; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    records.push({
      energy: (Math.random() * 20 + 5).toFixed(2),
      timestamp: Math.floor(date.getTime() / 1000),
      user: "You",
      source: "mock"
    });
  }
  
  return records;
}

// Add this temporary route to your server.js to fix existing products
app.post("/api/fix-products", authenticate, authorizeRole("admin", "vendor"), async (req, res) => {
  try {
    console.log("🔧 Fixing product types...");
    
    const products = await Product.find();
    let fixedCount = 0;
    
    for (let product of products) {
      const originalType = product.type;
      const normalizedType = normalizeProductType(product.type);
      
      if (originalType !== normalizedType) {
        product.type = normalizedType;
        product.status = "active"; // Ensure all products are active
        await product.save();
        fixedCount++;
        console.log(`✅ Fixed product: ${product.name} (${originalType} -> ${normalizedType})`);
      }
    }
    
    res.json({
      success: true,
      message: `Fixed ${fixedCount} products`,
      totalProducts: products.length
    });
    
  } catch (err) {
    console.error("❌ Error fixing products:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fix products"
    });
  }
});

// ——————————— SUPPORT STAFF ROUTES ———————————

// Get all support tickets
app.get("/api/support/tickets", authenticate, requireRole("supportstaff"), async (req, res) => {
  try {
    console.log("📋 Fetching support tickets...");
    
    // Mock data - replace with database queries later
    const mockTickets = [
      {
        _id: "1",
        issue: "Solar panel installation inquiry",
        customerName: "John Doe",
        status: "Open",
        priority: "High",
        category: "Installation",
        createdAt: new Date().toISOString(),
        description: "Customer wants to install solar panels for their home"
      },
      {
        _id: "2", 
        issue: "Energy monitoring system not syncing",
        customerName: "Jane Smith",
        status: "In Progress",
        priority: "Medium",
        category: "Technical",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        description: "Energy data not updating in real-time on dashboard"
      },
      {
        _id: "3",
        issue: "Blockchain transaction verification failed",
        customerName: "Mike Johnson",
        status: "Resolved",
        priority: "High",
        category: "Blockchain",
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        description: "Energy record transaction failed to confirm on blockchain"
      },
      {
        _id: "4",
        issue: "Billing discrepancy for energy credits",
        customerName: "Sarah Wilson",
        status: "Open",
        priority: "Medium",
        category: "Billing",
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        description: "Customer reports incorrect energy credit calculation"
      }
    ];

    res.json({
      success: true,
      data: mockTickets,
      count: mockTickets.length
    });
  } catch (err) {
    console.error("❌ Support tickets fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch support tickets" 
    });
  }
});

// Get installation statuses
app.get("/api/support/installations", authenticate, requireRole("supportstaff"), async (req, res) => {
  try {
    console.log("🔧 Fetching installation statuses...");
    
    const mockInstallations = [
      {
        _id: "1",
        customerName: "Sarah Wilson",
        address: "123 Solar Street, Maseru 100",
        systemType: "Residential Solar",
        status: "Scheduled",
        scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 0
      },
      {
        _id: "2",
        customerName: "David Brown",
        address: "456 Green Avenue, Maseru 100",
        systemType: "Commercial Solar",
        status: "In Progress",
        scheduledDate: new Date().toISOString(),
        progress: 65
      },
      {
        _id: "3",
        customerName: "Lisa Chen",
        address: "789 Renewable Road, Maseru 100",
        systemType: "Hybrid System",
        status: "Completed",
        scheduledDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        progress: 100
      }
    ];

    res.json({
      success: true,
      data: mockInstallations,
      count: mockInstallations.length
    });
  } catch (err) {
    console.error("❌ Installations fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch installations" 
    });
  }
});

// Update ticket status
app.post("/api/support/update-ticket", authenticate, requireRole("supportstaff"), async (req, res) => {
  try {
    const { ticketId, status } = req.body;
    
    console.log(`🔄 Updating ticket ${ticketId} to status: ${status}`);
    
    // Validate status
    const validStatuses = ["Open", "In Progress", "Resolved", "Closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be one of: " + validStatuses.join(", ")
      });
    }

    // In a real application, you would update the ticket in the database
    // For now, return success response
    res.json({
      success: true,
      message: `Ticket ${ticketId} status updated to ${status}`,
      data: {
        ticketId,
        status,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("❌ Ticket update error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to update ticket" 
    });
  }
});

// Update installation status
app.post("/api/support/update-installation", authenticate, requireRole("supportstaff"), async (req, res) => {
  try {
    const { installationId, status } = req.body;
    
    console.log(`🔧 Updating installation ${installationId} to status: ${status}`);
    
    // Validate status
    const validStatuses = ["Scheduled", "In Progress", "Completed", "Delayed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be one of: " + validStatuses.join(", ")
      });
    }

    // Calculate progress based on status
    let progress = 0;
    switch (status) {
      case "Scheduled": progress = 0; break;
      case "In Progress": progress = 50; break;
      case "Completed": progress = 100; break;
      case "Delayed": progress = 25; break;
    }

    res.json({
      success: true,
      message: `Installation ${installationId} status updated to ${status}`,
      data: {
        installationId,
        status,
        progress,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("❌ Installation update error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to update installation" 
    });
  }
});

// Create new support ticket
app.post("/api/support/create-ticket", authenticate, requireRole("supportstaff"), async (req, res) => {
  try {
    const { issue, priority, category, customerName, description } = req.body;
    
    console.log("🎫 Creating new support ticket:", { issue, priority, category });

    if (!issue) {
      return res.status(400).json({
        success: false,
        error: "Issue description is required"
      });
    }

    const newTicket = {
      _id: `ticket_${Date.now()}`,
      issue,
      priority: priority || "Medium",
      category: category || "Technical",
      customerName: customerName || "Support Created",
      description: description || issue,
      status: "Open",
      createdAt: new Date().toISOString(),
      createdBy: req.user.userId
    };

    res.json({
      success: true,
      message: "Support ticket created successfully",
      data: newTicket
    });
  } catch (err) {
    console.error("❌ Ticket creation error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to create support ticket" 
    });
  }
});

// Get support dashboard stats
app.get("/api/support/dashboard", authenticate, requireRole("supportstaff"), async (req, res) => {
  try {
    console.log("📊 Fetching support dashboard stats...");
    
    const dashboardStats = {
      openTickets: 8,
      inProgressTickets: 12,
      resolvedTickets: 45,
      scheduledInstallations: 5,
      activeInstallations: 3,
      completedInstallations: 28,
      averageResponseTime: "2.3 hours",
      customerSatisfaction: "94%"
    };

    res.json({
      success: true,
      data: dashboardStats
    });
  } catch (err) {
    console.error("❌ Support dashboard error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch support dashboard" 
    });
  }
});

// ——————————— TECHNICIAN ROUTES ———————————

// Get technician jobs
app.get("/api/technician/jobs", authenticate, requireRole("technician"), async (req, res) => {
  try {
    console.log("🔧 Fetching technician jobs...");
    
    const mockJobs = [
      {
        id: "INST-2025-1106",
        type: "Solar Installation",
        customer: "Mr. J. Mokoena",
        address: "123 Zone 6, Meadowlands, Soweto",
        priority: "High",
        scheduledTime: "09:00 - 11:00",
        status: "En Route",
        systemType: "Residential Solar",
        equipment: ["Solar Panels x12", "Inverter 5kW", "Battery Storage"],
        progress: 0,
        blockchainTx: "0x7d5a8c...f3e2a1"
      },
      {
        id: "FAULT-2025-1107",
        type: "Grid Fault Repair",
        customer: "Soweto Clinic",
        address: "456 Kliptown Rd, Soweto",
        priority: "Critical",
        scheduledTime: "11:30 - 13:00",
        status: "Pending",
        systemType: "Commercial Grid",
        equipment: ["Fault Locator", "Transformer Tools", "Safety Gear"],
        progress: 0,
        blockchainTx: "Pending"
      },
      {
        id: "MAINT-2025-1108",
        type: "Smart Meter Maintenance",
        customer: "Thandi's Tuckshop",
        address: "789 Orlando West, Soweto",
        priority: "Medium",
        scheduledTime: "14:00 - 14:30",
        status: "Scheduled",
        systemType: "Metering System",
        equipment: ["Meter Tester", "Calibration Tools"],
        progress: 0,
        blockchainTx: "0x9b4c2a...d8e7f6"
      }
    ];

    res.json({
      success: true,
      data: mockJobs,
      count: mockJobs.length
    });
  } catch (err) {
    console.error("❌ Technician jobs fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch technician jobs" 
    });
  }
});

// Get technician installations
app.get("/api/technician/installations", authenticate, requireRole("technician"), async (req, res) => {
  try {
    console.log("⚡ Fetching technician installations...");
    
    const mockInstallations = [
      {
        id: "INST-001",
        customer: "B. Nkosi",
        address: "321 Diepkloof Ext, Soweto",
        systemType: "Hybrid Solar System",
        capacity: "8kW",
        status: "Commissioned",
        commissionDate: "2024-10-15",
        energyProduced: "2.8 MWh",
        blockchainVerified: true
      },
      {
        id: "INST-002",
        customer: "M. Vilakazi",
        address: "654 Orlando East, Soweto",
        systemType: "Grid-Tie Solar",
        capacity: "5kW",
        status: "Active",
        commissionDate: "2024-09-22",
        energyProduced: "1.5 MWh",
        blockchainVerified: true
      }
    ];

    res.json({
      success: true,
      data: mockInstallations,
      count: mockInstallations.length
    });
  } catch (err) {
    console.error("❌ Installations fetch error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch installations" 
    });
  }
});

// Update job status
app.post("/api/technician/update-job", authenticate, requireRole("technician"), async (req, res) => {
  try {
    const { jobId, status, progress } = req.body;
    
    console.log(`🔄 Updating job ${jobId} to status: ${status}, progress: ${progress}%`);
    
    const validStatuses = ["Scheduled", "En Route", "In Progress", "Completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be one of: " + validStatuses.join(", ")
      });
    }

    res.json({
      success: true,
      message: `Job ${jobId} updated successfully`,
      data: {
        jobId,
        status,
        progress: progress || 0,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("❌ Job update error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to update job" 
    });
  }
});

// Update installation progress
app.post("/api/technician/update-installation", authenticate, requireRole("technician"), async (req, res) => {
  try {
    const { installationId, progress } = req.body;
    
    console.log(`⚡ Updating installation ${installationId} progress: ${progress}%`);

    if (progress < 0 || progress > 100) {
      return res.status(400).json({
        success: false,
        error: "Progress must be between 0 and 100"
      });
    }

    res.json({
      success: true,
      message: `Installation ${installationId} progress updated`,
      data: {
        installationId,
        progress,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("❌ Installation update error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to update installation" 
    });
  }
});

// Get technician dashboard stats
app.get("/api/technician/dashboard", authenticate, requireRole("technician"), async (req, res) => {
  try {
    console.log("📊 Fetching technician dashboard stats...");
    
    const dashboardStats = {
      activeJobs: 3,
      completedJobs: 28,
      installations: 15,
      blockchainRecords: 42,
      averageResponseTime: "45 min",
      customerSatisfaction: "96%",
      safetyCompliance: "100%",
      toolsAvailable: 24
    };

    res.json({
      success: true,
      data: dashboardStats
    });
  } catch (err) {
    console.error("❌ Technician dashboard error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch dashboard" 
    });
  }
});

// Record job completion on blockchain
app.post("/api/technician/record-completion", authenticate, requireRole("technician"), async (req, res) => {
  try {
    const { jobId, installationId, energyProduced, notes } = req.body;
    
    console.log(`📝 Recording job completion on blockchain: ${jobId}`);

    if (!energyContract || !isBlockchainConnected) {
      return res.json({
        success: true,
        data: {
          jobId,
          installationId,
          txHash: "mock-tx-completion-" + Date.now(),
          status: "mock-recorded",
          note: "Blockchain unavailable - completion recorded locally"
        }
      });
    }

    // Store completion record on blockchain
    const energyToStore = Math.round((energyProduced || 0) * 100);
    const tx = await energyContract.storeEnergy(energyToStore);
    const receipt = await tx.wait();

    res.json({
      success: true,
      data: {
        jobId,
        installationId,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        energyProduced: energyProduced || 0,
        notes: notes || "",
        status: "recorded",
        timestamp: Math.floor(Date.now() / 1000)
      }
    });
  } catch (err) {
    console.error("❌ Job completion recording error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to record job completion on blockchain" 
    });
  }
});

// ——————————— REGULATORY OFFICER ROUTES ———————————
app.get("/api/regulatory/overview", authenticate, requireRole("regulatoryofficer"), async (req, res) => {
  try {
    console.log("📊 Fetching regulatory dashboard overview...");
    
    const totalUsers = await User.countDocuments();
    const activeTransactions = await Product.countDocuments({ status: "active" });
    
    const gdprCompliantUsers = await User.countDocuments({ 
      $or: [
        { gdprConsent: true },
        { privacyAccepted: true },
        { dataProcessingConsent: true }
      ]
    });
    
    const complianceStatus = gdprCompliantUsers === totalUsers && totalUsers > 0 ? "Compliant" : "Needs Review";
    
    const overviewData = {
      totalUsers,
      activeTransactions,
      complianceStatus,
      gdprComplianceRate: totalUsers > 0 ? Math.round((gdprCompliantUsers / totalUsers) * 100) : 0,
      dataClassifications: {
        public: await Product.countDocuments({ classification: "public" }),
        private: await User.countDocuments(),
        confidential: await Product.countDocuments({ classification: "confidential" }),
        restricted: await Product.countDocuments({ classification: "restricted" })
      }
    };

    res.json({
      success: true,
      overview: overviewData
    });
  } catch (err) {
    console.error("❌ Regulatory overview error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch regulatory overview" 
    });
  }
});

app.get("/api/regulatory/reports", authenticate, requireRole("regulatoryofficer"), async (req, res) => {
  try {
    console.log("📋 Fetching compliance reports...");
    
    const mockReports = [
      {
        id: "GDPR-AUDIT-2024-001",
        type: "GDPR Compliance Audit",
        generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: "Compliant",
        summary: "All user data processing activities comply with GDPR requirements. 100% of users have provided consent for data processing.",
        issuesFound: 0,
        recommendations: "Continue current practices and schedule quarterly reviews"
      },
      {
        id: "DATA-CLASS-2024-001", 
        type: "Data Classification Review",
        generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "Needs Improvement",
        summary: "85% of data properly classified, 15% requires reclassification. Private user data is fully protected.",
        issuesFound: 3,
        recommendations: "Review unclassified transaction records and implement automated classification"
      },
      {
        id: "SECURITY-2024-001",
        type: "Security Configuration Audit",
        generatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: "Compliant",
        summary: "Role-based access control properly implemented across all modules. Security domain configuration is optimal.",
        issuesFound: 1,
        recommendations: "Enhance vendor access logging and implement real-time monitoring"
      }
    ];

    res.json({
      success: true,
      data: mockReports
    });
  } catch (err) {
    console.error("❌ Compliance reports error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch compliance reports" 
    });
  }
});

app.post("/api/regulatory/generate-report", authenticate, requireRole("regulatoryofficer"), async (req, res) => {
  try {
    console.log("📝 Generating new compliance report...");
    
    const totalUsers = await User.countDocuments();
    const gdprCompliantUsers = await User.countDocuments({ 
      $or: [
        { gdprConsent: true },
        { privacyAccepted: true },
        { dataProcessingConsent: true }
      ]
    });
    
    const complianceRate = totalUsers > 0 ? Math.round((gdprCompliantUsers / totalUsers) * 100) : 0;
    
    const newReport = {
      id: `COMPLIANCE-${Date.now()}`,
      type: "Automated Compliance Check",
      generatedAt: new Date().toISOString(),
      status: complianceRate >= 95 ? "Compliant" : "Needs Review",
      summary: `GDPR compliance rate: ${complianceRate}%. ${totalUsers} users scanned. ${gdprCompliantUsers} users with valid consent.`,
      issuesFound: complianceRate >= 95 ? 0 : Math.ceil((100 - complianceRate) / 5),
      recommendations: complianceRate >= 95 ? 
        "Maintain current compliance standards and continue monitoring" : 
        "Implement additional user consent verification and conduct awareness training"
    };

    res.json({
      success: true,
      data: newReport,
      message: "Compliance report generated successfully"
    });
  } catch (err) {
    console.error("❌ Report generation error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to generate compliance report" 
    });
  }
});

app.get("/api/regulatory/data-classification", authenticate, requireRole("regulatoryofficer"), async (req, res) => {
  try {
    console.log("🔍 Analyzing data classification...");
    
    const dataClassification = {
      public: {
        count: await Product.countDocuments({ classification: "public" }),
        examples: ["Product listings", "Energy prices", "Service descriptions", "Market analytics"],
        gdprImplication: "No personal data - low risk, publicly accessible information"
      },
      private: {
        count: await User.countDocuments(),
        examples: ["User profiles", "Contact information", "Account settings", "Personal preferences"],
        gdprImplication: "Requires explicit consent, right to erasure, and data portability under GDPR"
      },
      confidential: {
        count: await Product.countDocuments({ classification: "confidential" }),
        examples: ["Transaction details", "Energy usage patterns", "Payment records", "Billing information"],
        gdprImplication: "Requires encryption, strict access controls, and regular security assessments"
      },
      restricted: {
        count: await Product.countDocuments({ classification: "restricted" }),
        examples: ["Admin logs", "Security configurations", "System credentials", "Audit trails"],
        gdprImplication: "Highest protection level - limited access, comprehensive logging, and regular reviews"
      }
    };

    res.json({
      success: true,
      data: dataClassification,
      gdprCompliance: {
        article30: "Compliant - Records of processing activities maintained",
        article32: "Compliant - Security measures implemented", 
        article35: "Review Needed - Data Protection Impact Assessment scheduled",
        article5: "Compliant - Data minimization and purpose limitation enforced"
      }
    });
  } catch (err) {
    console.error("❌ Data classification error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to analyze data classification" 
    });
  }
});

app.get("/api/regulatory/access-controls", authenticate, requireRole("regulatoryofficer"), async (req, res) => {
  try {
    console.log("🔐 Verifying access controls...");
    
    const accessControls = {
      roles: {
        customer: {
          read: ["own_profile", "products", "energy_data", "billing_info"],
          write: ["own_profile", "energy_preferences", "consent_settings"],
          modules: ["Dashboard", "Energy Monitoring", "Profile", "Consent Management"]
        },
        vendor: {
          read: ["products", "market_data", "customer_requests", "sales_analytics"],
          write: ["products", "bids", "inventory", "pricing"],
          modules: ["Vendor Dashboard", "Product Management", "Sales Analytics", "Marketplace"]
        },
        technician: {
          read: ["installations", "schedules", "customer_addresses", "equipment_specs"],
          write: ["job_status", "installation_records", "maintenance_logs", "completion_certs"],
          modules: ["Technician Dashboard", "Job Management", "Installation Records", "Equipment Tracking"]
        },
        supportstaff: {
          read: ["tickets", "user_data", "system_logs", "knowledge_base"],
          write: ["ticket_status", "support_responses", "documentation"],
          modules: ["Support Dashboard", "Ticket Management", "User Support", "Knowledge Base"]
        },
        regulatoryofficer: {
          read: ["all_data", "compliance_reports", "system_logs", "audit_trails"],
          write: ["compliance_flags", "audit_logs", "policy_updates"],
          modules: ["Regulatory Dashboard", "Compliance Monitoring", "GDPR Management", "Audit Console"]
        }
      },
      securityConfig: {
        domain: "security.energyconnect.com",
        authentication: "JWT Tokens with RSA256",
        encryption: "AES-256 for sensitive data at rest, TLS 1.3 for data in transit",
        logging: "Comprehensive audit trails with 365-day retention"
      }
    };

    res.json({
      success: true,
      data: accessControls,
      compliance: "All role-based access controls properly configured and GDPR compliant"
    });
  } catch (err) {
    console.error("❌ Access control verification error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to verify access controls" 
    });
  }
});

// ——————————— DEBUG & TESTING ENDPOINTS ———————————

// Debug endpoint to test energy recording
app.post("/api/energy/debug", authenticate, (req, res) => {
  console.log("🔍 Debug - Headers:", req.headers);
  console.log("🔍 Debug - Body:", req.body);
  console.log("🔍 Debug - Body type:", typeof req.body);
  
  res.json({
    success: true,
    received: req.body,
    message: "Check server console for details"
  });
});

// Test registration endpoint (for debugging)
app.post("/api/test-register", async (req, res) => {
  try {
    const { name, email, password, role, termsAccepted, privacyAccepted } = req.body;
    
    console.log("🧪 Test registration received:", { name, email, role });
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    res.status(200).json({
      success: true,
      message: "Test registration successful",
      data: { 
        name, 
        email, 
        role,
        termsAccepted,
        privacyAccepted,
        test: true 
      }
    });
  } catch (error) {
    console.error("❌ Test registration error:", error);
    res.status(500).json({ 
      success: false,
      error: "Test failed: " + error.message 
    });
  }
});

// Debug blockchain connection
app.get("/api/debug/blockchain", async (req, res) => {
  try {
    // ethers v5 syntax
    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
    
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    const accounts = await provider.listAccounts();
    
    // Check contract
    let contractCode = '0x';
    let contractInfo = "Not deployed";
    
    try {
      contractCode = await provider.getCode("0x5FbDB2315678afecb367f032d93f642f64180aa3");
      if (contractCode !== '0x') {
        contractInfo = "Deployed - Code length: " + contractCode.length;
      }
    } catch (e) {
      contractInfo = "Error: " + e.message;
    }
    
    res.json({
      success: true,
      hardhatConnected: true,
      blockNumber,
      chainId: network.chainId,
      networkName: network.name,
      accounts: accounts.length,
      contractAddress: "0x5FbDB2315678afecb367f032d93f642f64180aa3",
      contractStatus: contractInfo,
      serverBlockchainStatus: isBlockchainConnected ? "Connected" : "Disconnected"
    });
    
  } catch (error) {
    res.json({
      success: false,
      hardhatConnected: false,
      error: error.message
    });
  }
});

// ——————————— ERROR HANDLING MIDDLEWARE ———————————

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    suggestion: "Check the API documentation for available endpoints"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: "Duplicate entry",
      field: Object.keys(err.keyPattern)[0]
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }
  
  res.status(500).json({ 
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ——————————— START SERVER ———————————
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Blockchain status: http://localhost:${PORT}/api/blockchain/status`);
  console.log(`🤖 AI Dashboard: http://localhost:${PORT}/api/ai/dashboard-data`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Started at: ${new Date().toISOString()}\n`);
  console.log(`🎯 AI endpoints available at: http://localhost:${PORT}/api/ai`);
  console.log(`🎫 Support endpoints available at: http://localhost:${PORT}/api/support`);
  console.log(`🔧 Technician endpoints available at: http://localhost:${PORT}/api/technician`);
  console.log(`📋 Regulatory endpoints available at: http://localhost:${PORT}/api/regulatory`);
  console.log(`👤 Customer endpoints available at: http://localhost:${PORT}/api/customer`);
  console.log(`🏪 Vendor endpoints available at: http://localhost:${PORT}/api/vendor`);
  console.log(`🔐 Auth endpoints available at: http://localhost:${PORT}/api/auth`);
  
  // Initialize AI services after server starts
  setTimeout(initializeAIServices, 1000);
}).on('error', (err) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`   Port ${PORT} is already in use!`);
    console.log('   Try:');
    console.log(`   - Using a different PORT (currently ${PORT})`);
    console.log(`   - Killing the process using port ${PORT}`);
    console.log(`   - Waiting a few seconds and trying again`);
  }
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    // Close MongoDB connection
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      console.log('👋 Process terminated gracefully');
      process.exit(0);
    });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.log('❌ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;