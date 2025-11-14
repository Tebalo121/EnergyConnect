const mongoose = require("mongoose");

const TokenSchema = new mongoose.Schema({
  user_id: Number,
  district: String,
  purchase_date: Date,
  tokens_bought: Number,
  tokens_used: Number,
  remaining_tokens: Number
});

module.exports = mongoose.model("Token", TokenSchema);