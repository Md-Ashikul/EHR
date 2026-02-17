import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl, adminPrivateKey } from '../../lib/constants';

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { name, wallet } = req.body;

    try {
        const provider = new ethers.JsonRpcProvider(providerUrl);
        const walletSigner = new ethers.Wallet(adminPrivateKey, provider);
        const contract = new ethers.Contract(contractAddress, contractABI, walletSigner);
        
        const tx = await contract.registerPatient(name, wallet);
        await tx.wait();

        const patientIdBN = await contract.patientIdCounter();
        
        res.status(200).json({
            message: "Patient registered successfully",
            patientId: patientIdBN.toString(),
            txHash: tx.hash,
        });
    } catch (error) {
        console.error("Error registering patient:", error);
        res.status(500).json({ error: "Error registering patient", details: error.message });
    }
}