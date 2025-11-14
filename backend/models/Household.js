const mongoose = require("mongoose");

const HouseholdSchema = new mongoose.Schema({
  household_id: Number,
  district: String,
  date: Date,
  sunlight_hours: Number,
  energy_usage_kwh: Number,
  temperature_c: Number
});

module.exports = mongoose.model("Household", HouseholdSchema);