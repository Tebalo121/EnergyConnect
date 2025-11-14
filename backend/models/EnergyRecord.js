const mongoose = require("mongoose");

const energyRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  energy: {
    type: Number,
    required: true,
    min: 0
  },
  timestamp: {
    type: Number, // Unix timestamp
    required: true
  },
  source: {
    type: String,
    default: "solar",
    enum: ["solar", "wind", "hydro", "biomass", "grid"]
  },
  recordedAt: {
    type: Date,
    default: Date.now
  },
  // Simulated blockchain data
  blockchainData: {
    txHash: {
      type: String,
      required: true
    },
    blockNumber: {
      type: Number,
      required: true
    },
    gasUsed: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      default: "confirmed",
      enum: ["pending", "confirmed", "failed"]
    },
    confirmedAt: {
      type: Date,
      default: Date.now
    }
  },
  metadata: {
    location: String,
    deviceId: String,
    efficiency: Number,
    weatherConditions: {
      temperature: Number,
      humidity: Number,
      solarIrradiance: Number
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
energyRecordSchema.index({ userId: 1, timestamp: -1 });
energyRecordSchema.index({ 'blockchainData.txHash': 1 });
energyRecordSchema.index({ recordedAt: -1 });

// Virtual for formatted date
energyRecordSchema.virtual('formattedDate').get(function() {
  return new Date(this.timestamp * 1000).toLocaleString();
});

// Static method to get user's total energy production
energyRecordSchema.statics.getUserTotalEnergy = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalEnergy: { $sum: "$energy" } } }
  ]);
};

// Instance method to get transaction URL (simulated)
energyRecordSchema.methods.getTransactionUrl = function() {
  return `https://blockchain.energyconnect.com/tx/${this.blockchainData.txHash}`;
};

module.exports = mongoose.model("EnergyRecord", energyRecordSchema);