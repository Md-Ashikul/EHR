const hre = require("hardhat");
const fs = require("fs"); // Import Node.js File System module
const path = require("path"); // Import Node.js Path module

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const Contract = await hre.ethers.getContractFactory("DoctorPatient");
  const contract = await Contract.deploy();

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("Contract deployed to:", contractAddress);

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