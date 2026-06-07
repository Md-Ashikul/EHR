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

        let tx = await contract.revokeAccess(pId, dId);
        await tx.wait();

        res.status(200).json({ success: true, message: "Access revoked successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}