import { ethers } from "ethers";
import { contractAddress, contractABI, providerUrl } from "./constants";

// Build a contract instance signed by a locally-held private key.
//
// SECURITY: This runs in the browser only. The private key is used to sign the
// transaction locally against the RPC endpoint and is NEVER transmitted to any
// API route or server. Do not import this module from `pages/api/*`.
export function getSignedContract(privateKey) {
  if (typeof window === "undefined") {
    throw new Error("getSignedContract must only be called in the browser.");
  }
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, contractABI, wallet);
  return { provider, wallet, contract };
}

// Compute gas/cost metrics from a mined transaction receipt (for thesis measurements).
export async function computeTxMetrics(provider, receipt) {
  const gasUsed = receipt.gasUsed;
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 1000000000n; // Default 1 Gwei on local Hardhat
  const costWei = gasUsed * gasPrice;
  const costEth = ethers.formatEther(costWei);
  const costUsd = (parseFloat(costEth) * 3000).toFixed(4); // Assumed ETH price for the paper
  return { gasUsed: gasUsed.toString(), costEth, costUsd };
}
