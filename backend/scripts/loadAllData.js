const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");
require("dotenv").config({ path: "../../.env" }); // CRITICAL: LOAD FROM ROOT

console.log("Connecting to:", process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MONGODB CONNECTED"))
  .catch(err => {
    console.error("MONGODB CONNECTION FAILED:", err.message);
    process.exit(1);
  });

const models = {
  household: require("../models/Household"),
  token: require("../models/Token"),
  product: require("../models/Product")
};

const files = [
  { name: "household", path: "./data/household_usage.csv", model: "household" },
  { name: "token", path: "./data/token_purchases.csv", model: "token" },
  { name: "product", path: "./data/products.csv", model: "product" }
];

async function load() {
  for (const file of files) {
    const data = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(file.path)
        .pipe(csv())
        .on("data", (row) => {
          if (file.name === "household") row.date = new Date(row.date);
          if (file.name === "token") row.purchase_date = new Date(row.purchase_date);
          data.push(row);
        })
        .on("end", async () => {
          try {
            await models[file.model].deleteMany({});
            await models[file.model].insertMany(data);
            console.log(`${file.name.toUpperCase()} LOADED: ${data.length} rows`);
            resolve();
          } catch (err) {
            reject(err);
          }
        })
        .on("error", reject);
    });
  }
  console.log("ALL DATA LOADED — LESOTHO ENERGY GRID ONLINE");
  mongoose.connection.close();
}

load().catch(err => {
  console.error("LOAD FAILED:", err);
  process.exit(1);
});