import { ethers } from 'ethers';
import bcrypt from 'bcryptjs';
import { readDoctorDB, writeDoctorDB } from '../../lib/db-handler';
import { 
  contractAddress, 
  contractABI, 
  providerUrl, 
  adminPrivateKey 
} from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, password, walletAddress } = req.body;
  const doctorDatabase = readDoctorDB();

  let id;
  let doctor;

  try {
    console.log("--- STARTING DOCTOR REGISTRATION ---");
    const t_start = performance.now();

    id = parseInt(doctorId, 10);
    doctor = doctorDatabase[id];

    // 1. Validation
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }
    if (doctor.passwordHash !== null) {
      return res.status(400).json({ error: 'Doctor already registered.' });
    }

    // 2. Hash Password (DO NOT SAVE TO DB YET)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ---------------------------------------------------------
    // 3. BLOCKCHAIN REGISTRATION (With Nonce Fix)
    // ---------------------------------------------------------
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const walletSigner = new ethers.Wallet(adminPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, contractABI, walletSigner);

    // FIX: Get the exact current transaction count (nonce) for the Admin wallet
    let currentNonce = await walletSigner.getNonce();

    // Tx 1: Pre-register the doctor's data using the current nonce
    console.log(`Sending Tx 1 with nonce: ${currentNonce}`);
    const tx1 = await contract.registerDoctorData(id, doctor.name, { nonce: currentNonce });
    const receipt1 = await tx1.wait();

    // Tx 2: Finalize doctor registration using the NEXT nonce (+1)
    console.log(`Sending Tx 2 with nonce: ${currentNonce + 1}`);
    const tx2 = await contract.registerDoctor(doctor.name, id, walletAddress, { nonce: currentNonce + 1 });
    const receipt2 = await tx2.wait();

    // ---------------------------------------------------------
    // 4. Update Mock Database ONLY AFTER BLOCKCHAIN SUCCESS
    // ---------------------------------------------------------
    doctorDatabase[id].passwordHash = hashedPassword;
    doctorDatabase[id].wallet = walletAddress; 
    writeDoctorDB(doctorDatabase);

    // --- METRICS CALCULATION ---
    const t_end = performance.now();
    const latency = (t_end - t_start).toFixed(2);
    const gasUsed1 = receipt1.gasUsed;
    const gasUsed2 = receipt2.gasUsed;
    const totalGas = gasUsed1 + gasUsed2;

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 1000000000n; 
    
    const costWei = totalGas * gasPrice;
    const costEth = ethers.formatEther(costWei);
    const ethPriceUsd = 3000; 
    const costUsd = (parseFloat(costEth) * ethPriceUsd).toFixed(4);

    console.log(`[METRIC] Registration Latency: ${latency} ms`);
    console.log(`[METRIC] Tx1 Gas: ${gasUsed1} | Tx2 Gas: ${gasUsed2}`);
    console.log(`[METRIC] Total Gas: ${totalGas}`);
    console.log(`[METRIC] Total Cost: ${costEth} ETH ($${costUsd} USD)`);
    console.log("------------------------------------");

    res.status(200).json({ 
      success: true, 
      message: 'Registration complete!',
      txHash: tx2.hash,
      metrics: {
        latency,
        gasUsed: totalGas.toString(),
        costUsd
      }
    });

  } catch (error) {
    console.error("Doctor Registration Error:", error);
    res.status(500).json({ error: "Failed to register doctor", details: error.message });
  }
}