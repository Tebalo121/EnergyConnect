const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    minlength: [2, "Name must be at least 2 characters"]
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"]
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters"]
  },
  role: {
    type: String,
    enum: ["customer", "vendor", "technician", "admin", "supportstaff", "regulatoryofficer"],
    default: "customer"
  },
  termsAccepted: {
    type: Boolean,
    default: false, // Changed from required to default false
    validate: {
      validator: function(v) {
        return v === true;
      },
      message: "You must accept the terms of service"
    }
  },
  privacyAccepted: {
    type: Boolean,
    default: false, // Changed from required to default false
    validate: {
      validator: function(v) {
        return v === true;
      },
      message: "You must accept the privacy policy"
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

// Method to check if user is active
userSchema.methods.isUserActive = function() {
  return this.isActive;
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model("User", userSchema);