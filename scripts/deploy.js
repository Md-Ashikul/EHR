const hre = require("hardhat");
const fs = require("fs"); 
const path = require("path"); 

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("--- STARTING DEPLOYMENT METRICS ---");
  const t_start = performance.now(); 

  const Contract = await hre.ethers.getContractFactory("DoctorPatient");
  const contract = await Contract.deploy();

  const receipt = await contract.deploymentTransaction().wait();
  const contractAddress = await contract.getAddress();
  
  const t_end = performance.now(); 
  const deployLatency = (t_end - t_start).toFixed(2);

  // --- GAS COST CALCULATION ---
  const gasUsed = receipt.gasUsed;
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 1000000000n; 
  const costWei = gasUsed * gasPrice;
  const costEth = hre.ethers.formatEther(costWei);
  const ethPriceUsd = 3000; 
  const costUsd = (parseFloat(costEth) * ethPriceUsd).toFixed(4);

  console.log("Contract deployed to:", contractAddress);
  console.log(`[METRIC] Deployment Latency: ${deployLatency} ms`);
  console.log(`[METRIC] Gas Used: ${gasUsed}`);
  console.log(`[METRIC] Deployment Cost: ${costEth} ETH ($${costUsd} USD)`);
  console.log("-----------------------------------");

  // ----------------------------------------------------------------- //
  // AUTOMATED FIX: Delete all old off-chain databases to prevent mismatches
  // ----------------------------------------------------------------- //
  const filesToDelete = ["db.json", "patients.json", "keyvault.json"];

  filesToDelete.forEach((file) => {
    const filePath = path.join(__dirname, "..", file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Successfully deleted old state file: ${file}`);
      }
    } catch (err) {
      console.error(`Error deleting ${file}:`, err);
    }
  });
  
  console.log("✅ Local environment is clean and ready!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});