import { ethers } from "ethers";
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    
    const { patientId, doctorId, patientPrivateKey } = req.body;

    // THE FIX: Parse to Integers
    const pId = parseInt(patientId, 10);
    const dId = parseInt(doctorId, 10);

    try {
        const provider = new ethers.JsonRpcProvider(providerUrl);
        const wallet = new ethers.Wallet(patientPrivateKey, provider); 
        const contract = new ethers.Contract(contractAddress, contractABI, wallet);

        const tx = await contract.giveAccess(pId, dId);
        const receipt = await tx.wait();

        // --- METRICS ---
        const gasUsed = receipt.gasUsed;
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 1000000000n;
        const costWei = gasUsed * gasPrice;
        const costEth = ethers.formatEther(costWei);
        const costUsd = (parseFloat(costEth) * 3000).toFixed(4);

        console.log(`[METRIC - Give Access] Gas: ${gasUsed}, Cost: $${costUsd}`);

        res.status(200).json({ 
            success: true, 
            message: "Access granted successfully",
            metrics: { gasUsed: gasUsed.toString(), costUsd }
        });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
}