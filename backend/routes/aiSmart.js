const express = require("express");
const router = express.Router();
const { Grok } = require("@xai/grok");
const Household = require("../models/Household");
const Token = require("../models/Token");
const Product = require("../models/Product");
const { authenticate } = require("../middleware/auth");

const grok = new Grok({ apiKey: process.env.GROK_API_KEY });

router.post("/insight", authenticate, async (req, res) => {
  const { question } = req.body;
  const userDistrict = req.user.district || "Maseru"; // from JWT or profile

  try {
    // EXTRACT KEYWORDS
    const q = question.toLowerCase();
    const district = q.match(/(maseru|mafeteng|quthing|leribe|mohale|thaba|butha|qacha|berea)/i)?.[0] || userDistrict;
    const hasSolar = q.includes("solar") || q.includes("sunlight");
    const hasToken = q.includes("token") || q.includes("credit");
    const hasPrice = q.includes("price") || q.includes("cost");

    let context = "";

    if (hasSolar || hasToken) {
      const usage = await Household.find({ district: new RegExp(district, "i") }).limit(10);
      const avgUsage = usage.reduce((a, b) => a + b.energy_usage_kwh, 0) / usage.length || 0;
      const avgSun = usage.reduce((a, b) => a + b.sunlight_hours, 0) / usage.length || 0;
      context += `In ${district}: Avg daily usage = ${avgUsage.toFixed(2)} kWh, Avg sunlight = ${avgSun.toFixed(1)} hrs\n`;
    }

    if (hasToken) {
      const tokens = await Token.find({ district: new RegExp(district, "i") }).limit(5);
      const totalBought = tokens.reduce((a, b) => a + b.tokens_bought, 0);
      context += `Tokens bought in ${district}: ${totalBought}\n`;
    }

    if (hasPrice) {
      const products = await Product.find({ product_name: /Panel|Inverter|Battery/i }).limit(3);
      context += "Top products: " + products.map(p => `${p.product_name} = M${p.avg_price_maloti}`).join(", ") + "\n";
    }

    const response = await grok.chat.completions.create({
      model: "grok-beta",
      messages: [
        { role: "system", content: `You are SUNBOT — Lesotho's Energy Genius. Use this data:\n${context}\nAnswer in 2 sentences. Use M for Maloti. Be bold.` },
        { role: "user", content: question }
      ]
    });

    res.json({ answer: response.choices[0].message.content, district });

  } catch (err) {
    res.status(500).json({ error: "SUNBOT is charging..." });
  }
});

module.exports = router;