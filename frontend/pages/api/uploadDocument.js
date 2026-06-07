import { create } from 'ipfs-http-client';
import { ethers } from 'ethers';
import { contractAddress, contractABI, ipfsHost, ipfsApiPort, ipfsProtocol, providerUrl } from '../../lib/constants';

const connectToIPFS = () => {
  return create({
    host: ipfsHost,
    port: ipfsApiPort,
    protocol: ipfsProtocol,
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId, doctorId, diseaseName, description, imageFile } = req.body;

  // --- THE FIX: Parse IDs to integers to prevent String mismatch ---
  const parsedPatientId = parseInt(patientId, 10);
  const parsedDoctorId = parseInt(doctorId, 10);

  // --- METRIC VARIABLES ---
  let t0, t1, t2, t3;
  
  try {
    console.log("--- STARTING METRICS COLLECTION ---");
    t0 = performance.now(); // Start Total Timer

    // 1. Upload to IPFS
    const ipfsClient = connectToIPFS();
    const imageBuffer = Buffer.from(imageFile, 'base64');
    
    const t_ipfs_start = performance.now();
    const added = await ipfsClient.add(imageBuffer);
    const t_ipfs_end = performance.now();
    
    const imageCID = added.path;
    const ipfsLatency = (t_ipfs_end - t_ipfs_start).toFixed(2);
    console.log(`[METRIC] IPFS Upload Latency: ${ipfsLatency} ms`);

    // 2. Store in Smart Contract
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    // 3. Fetch Doctor Wallet
    const doctor = await contract.doctors(parsedDoctorId);
    const doctorWalletAddress = doctor.wallet;
    if (!doctorWalletAddress || doctor.id == 0) {
        return res.status(404).json({ error: "Doctor not found" });
    }

    // 4. Find Signer
    const accounts = await provider.listAccounts();
    const matchingAccount = accounts.find(
        (account) => account.address.toLowerCase() === doctorWalletAddress.toLowerCase()
    );

    if (!matchingAccount) {
        return res.status(403).json({ error: "Doctor wallet not found locally." });
    }

    const signer = await provider.getSigner(matchingAccount.address); 
    const contractWithSigner = new ethers.Contract(contractAddress, contractABI, signer);
    
    // 5. Call Contract & Measure Blockchain Time
    const t_bc_start = performance.now();
    
    const tx = await contractWithSigner.uploadDocument(parsedPatientId, parsedDoctorId, imageCID, diseaseName, description, imageCID);
    const receipt = await tx.wait(); // Wait for confirmation
    
    const t_bc_end = performance.now();
    const blockchainLatency = (t_bc_end - t_bc_start).toFixed(2);
    
    t3 = performance.now(); // End Total Timer
    const totalLatency = (t3 - t0).toFixed(2);

    // --- GAS COST CALCULATION ---
    const gasUsed = receipt.gasUsed;
    // For Hardhat local, sometimes getFeeData is inconsistent, so we assume a standard price if null, 
    // or fetch from provider.
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 1000000000n; // Default 1 Gwei if null
    const costWei = gasUsed * gasPrice;
    const costEth = ethers.formatEther(costWei);
    const ethPriceUsd = 3000; // Assumed ETH Price for Paper
    const costUsd = (parseFloat(costEth) * ethPriceUsd).toFixed(4);

    console.log(`[METRIC] Blockchain Write Latency: ${blockchainLatency} ms`);
    console.log(`[METRIC] Total End-to-End Latency: ${totalLatency} ms`);
    console.log(`[METRIC] Gas Used: ${gasUsed}`);
    console.log(`[METRIC] Transaction Cost: ${costEth} ETH ($${costUsd} USD)`);

    res.status(200).json({
      message: "Document uploaded successfully",
      txHash: tx.hash,
      imageCID: imageCID,
      metrics: {
        ipfsLatency,
        blockchainLatency,
        totalLatency,
        gasUsed: gasUsed.toString(),
        costUsd
      }
    });

  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Error uploading document", details: error.message });
  }
}