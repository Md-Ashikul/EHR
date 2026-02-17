import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { patientId, docIndex, doctorPrivateKey } = req.body;

  try {
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const wallet = new ethers.Wallet(doctorPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);

    const tx = await contract.deleteDocument(patientId, docIndex);
    await tx.wait();

    res.status(200).json({ message: "Document deleted successfully", txHash: tx.hash });
  } catch (error) {
    res.status(500).json({ error: "Error deleting document", details: error.message });
  }
}