const hre = require("hardhat");

async function main() {
  console.log("Deploying EnergyStorage...");

  const EnergyStorage = await hre.ethers.getContractFactory("EnergyStorage");
  const energyStorage = await EnergyStorage.deploy();

  // ethers v5 uses .deployed()
  await energyStorage.deployed();

  console.log("EnergyStorage deployed to:", energyStorage.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });