const hre = require("hardhat");
const fs = require("fs"); // Import Node.js File System module
const path = require("path"); // Import Node.js Path module

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("--- STARTING DEPLOYMENT METRICS ---");
  const t_start = performance.now(); // Start Timer

  const Contract = await hre.ethers.getContractFactory("DoctorPatient");
  const contract = await Contract.deploy();

  // Wait for deployment to finish to get the receipt for Gas data
  const receipt = await contract.deploymentTransaction().wait();

  const contractAddress = await contract.getAddress();
  
  const t_end = performance.now(); // End Timer
  const deployLatency = (t_end - t_start).toFixed(2);

  // --- GAS COST CALCULATION ---
  const gasUsed = receipt.gasUsed;
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 1000000000n; // Default 1 Gwei if local node returns null
  const costWei = gasUsed * gasPrice;
  const costEth = hre.ethers.formatEther(costWei);
  const ethPriceUsd = 3000; // Assumed ETH Price for Paper
  const costUsd = (parseFloat(costEth) * ethPriceUsd).toFixed(4);

  console.log("Contract deployed to:", contractAddress);
  console.log(`[METRIC] Deployment Latency: ${deployLatency} ms`);
  console.log(`[METRIC] Gas Used: ${gasUsed}`);
  console.log(`[METRIC] Deployment Cost: ${costEth} ETH ($${costUsd} USD)`);
  console.log("-----------------------------------");

  // ----------------------------------------------------------------- //
  // AUTOMATED FIX: Delete the old database file
  // ----------------------------------------------------------------- //
  const dbPath = path.join(__dirname, "..", "db.json"); // Path to the root db.json

  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log("Successfully deleted old off-chain database (db.json).");
    } else {
      console.log("Off-chain database (db.json) not found, skipping delete.");
    }
  } catch (err) {
    console.error("Error deleting db.json:", err);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});