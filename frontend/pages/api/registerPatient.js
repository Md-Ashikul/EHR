import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl, adminPrivateKey } from '../../lib/constants';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { name, wallet } = req.body;

    try {
        console.log("--- STARTING PATIENT REGISTRATION METRICS ---");
        const t_start = performance.now(); // Start Timer

        // 1. Use a dedicated patients.json file next to your db.json
        const patientsDbPath = path.join(process.cwd(), '..', 'patients.json');
        
        let patientsData = [];
        if (fs.existsSync(patientsDbPath)) {
            patientsData = JSON.parse(fs.readFileSync(patientsDbPath, 'utf8'));
        }
        
        // Auto-generate the sequential ID based on existing patients
        const newPatientId = patientsData.length + 1;

        // 2. Connect to Blockchain
        const provider = new ethers.JsonRpcProvider(providerUrl);
        const walletSigner = new ethers.Wallet(adminPrivateKey, provider);
        const contract = new ethers.Contract(contractAddress, contractABI, walletSigner);
        
        // 3. Register on Blockchain with the EXACT ID
        const tx = await contract.registerPatient(newPatientId, name, wallet);
        const receipt = await tx.wait(); // Get receipt for Gas

        // 4. Save EXACT ID to local patients.json to stay in sync
        patientsData.push({ id: newPatientId, name, wallet });
        fs.writeFileSync(patientsDbPath, JSON.stringify(patientsData, null, 2));

        const t_end = performance.now(); // End Timer
        const latency = (t_end - t_start).toFixed(2);

        // --- GAS COST CALCULATION ---
        const gasUsed = receipt.gasUsed;
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 1000000000n; // Default 1 Gwei
        const costWei = gasUsed * gasPrice;
        const costEth = ethers.formatEther(costWei);
        const ethPriceUsd = 3000; // Assumed ETH Price for Paper
        const costUsd = (parseFloat(costEth) * ethPriceUsd).toFixed(4);

        // --- UNIFORM LOGGING ---
        console.log(`[METRIC] Patient Registration Latency: ${latency} ms`);
        console.log(`[METRIC] Gas Used: ${gasUsed}`);
        console.log(`[METRIC] Transaction Cost: ${costEth} ETH ($${costUsd} USD)`);
        console.log("---------------------------------------------");
        
        res.status(200).json({
            message: "Patient registered successfully",
            patientId: newPatientId.toString(),
            txHash: tx.hash,
            metrics: { 
                latency, // Sending latency back to frontend
                gasUsed: gasUsed.toString(), 
                costUsd 
            }
        });

    } catch (error) {
        console.error("Patient Registration Error:", error);
        res.status(500).json({ error: "Failed to register patient", details: error.message });
    }
}