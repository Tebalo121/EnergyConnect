const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    required: true,
    enum: [
      'solar_panel', 
      'battery', 
      'inverter', 
      'controller', 
      'accessory',
      'solar_panels', // Add common variations
      'batteries',
      'inverters',
      'Solar Panel',
      'Battery Storage',
      'Inverter',
      'Water Heating'
    ]
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  description: {
    type: String,
    default: ""
  },
  category: {
    type: String,
    default: "solar_equipment",
    enum: [
      "solar_equipment",
      "storage", 
      "conversion",
      "monitoring",
      "water_heating"
    ]
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  images: [{
    type: String
  }],
  specifications: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Add index for better performance
productSchema.index({ vendorId: 1, status: 1 });
productSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Product', productSchema);