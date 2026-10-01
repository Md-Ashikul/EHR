import { create } from 'ipfs-http-client';
import { ethers } from 'ethers';
import { contractAddress, contractABI, ipfsHost, ipfsApiPort, ipfsProtocol, providerUrl } from '../../lib/constants';

const connectToIPFS = () => {
  return create({ host: ipfsHost, port: ipfsApiPort, protocol: ipfsProtocol });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId, doctorId, docId, ipfsPayload } = req.body;

  const parsedPatientId = parseInt(patientId, 10);
  const parsedDoctorId = parseInt(doctorId, 10);

  let t0, t3;

  try {
    console.log("--- STARTING UPLOAD METRICS COLLECTION ---");
    t0 = performance.now();

    // 1. Upload Encrypted JSON string to IPFS (Zero plain-text touches network)
    const ipfsClient = connectToIPFS();
    const t_ipfs_start = performance.now();
    const added = await ipfsClient.add(ipfsPayload);
    const t_ipfs_end = performance.now();

    const imageCID = added.path;
    const ipfsLatency = (t_ipfs_end - t_ipfs_start).toFixed(2);
    console.log(`[METRIC] IPFS Upload Latency: ${ipfsLatency} ms`);

    // 2. Connect to Blockchain
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    const doctor = await contract.doctors(parsedDoctorId);
    const doctorWalletAddress = doctor.wallet;

    if (!doctorWalletAddress || doctor.id == 0) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const accounts = await provider.listAccounts();
    const matchingAccount = accounts.find(
      (account) => account.address.toLowerCase() === doctorWalletAddress.toLowerCase()
    );

    if (!matchingAccount) return res.status(403).json({ error: "Doctor wallet not found locally." });

    const signer = await provider.getSigner(matchingAccount.address);
    const contractWithSigner = new ethers.Contract(contractAddress, contractABI, signer);

    // 3. Write purely placeholder metadata to the Blockchain (Zero-Knowledge)
    const t_bc_start = performance.now();
    const tx = await contractWithSigner.uploadDocument(
      parsedPatientId,
      parsedDoctorId,
      docId,
      imageCID,
      "ENCRYPTED",
      "ENCRYPTED",
      imageCID
    );
    const receipt = await tx.wait();
    const t_bc_end = performance.now();
    const blockchainLatency = (t_bc_end - t_bc_start).toFixed(2);

    t3 = performance.now();
    const totalLatency = (t3 - t0).toFixed(2);

    // 4. Calculate Gas & Costs
    const gasUsed = receipt.gasUsed;
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 1000000000n;
    const costEth = ethers.formatEther(gasUsed * gasPrice);
    const costUsd = (parseFloat(costEth) * 3000).toFixed(4);

    console.log(`[METRIC] Blockchain Write Latency: ${blockchainLatency} ms`);
    console.log(`[METRIC] Total End-to-End Latency: ${totalLatency} ms`);
    console.log(`[METRIC] Gas Used: ${gasUsed} | Cost: ${costEth} ETH ($${costUsd} USD)`);
    console.log("------------------------------------------");

    return res.status(200).json({
      message: "Document encrypted and uploaded successfully",
      txHash: tx.hash,
      imageCID: imageCID,
      metrics: { ipfsLatency, blockchainLatency, totalLatency, gasUsed: gasUsed.toString(), costUsd }
    });

  } catch (error) {
    console.error("Upload Error:", error);
    return res.status(500).json({ error: "Error uploading document", details: error.message });
  }
}
