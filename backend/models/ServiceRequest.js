// backend/models/ServiceRequest.js
const mongoose = require("mongoose");

const ServiceRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customerName: String,
    type: { type: String, enum: ["installation", "maintenance"], required: true },
    location: String,
    preferredDate: Date,
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    technician: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceRequest", ServiceRequestSchema);