import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { patientId, docIndex, doctorPrivateKey } = req.body;

  // THE FIX: Parse to Integers
  const pId = parseInt(patientId, 10);
  const index = parseInt(docIndex, 10);

  try {
    console.log("--- STARTING DELETE METRICS ---");
    const t_start = performance.now(); // Start Timer

    const provider = new ethers.JsonRpcProvider(providerUrl);
    const wallet = new ethers.Wallet(doctorPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);

    const tx = await contract.deleteDocument(pId, index);
    const receipt = await tx.wait(); // Wait for receipt to get Gas

    const t_end = performance.now(); // End Timer
    const deleteLatency = (t_end - t_start).toFixed(2);

    // --- GAS COST CALCULATION ---
    const gasUsed = receipt.gasUsed;
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 1000000000n; // Default 1 Gwei
    const costWei = gasUsed * gasPrice;
    const costEth = ethers.formatEther(costWei);
    const ethPriceUsd = 3000; // Assumed ETH Price
    const costUsd = (parseFloat(costEth) * ethPriceUsd).toFixed(4);

    console.log(`[METRIC] Blockchain Delete Latency: ${deleteLatency} ms`);
    console.log(`[METRIC] Gas Used: ${gasUsed}`);
    console.log(`[METRIC] Transaction Cost: ${costEth} ETH ($${costUsd} USD)`);
    console.log("-------------------------------");

    res.status(200).json({ 
      message: "Document deleted successfully", 
      txHash: tx.hash,
      metrics: {
        deleteLatency,
        gasUsed: gasUsed.toString(),
        costUsd
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Error deleting document", details: error.message });
  }
}