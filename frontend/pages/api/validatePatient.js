import { ethers } from "ethers";
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { patientId, patientName } = req.body;

  try {
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    const id = parseInt(patientId, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid Patient ID" });
    }

    // Fetch patient data from the contract
    const patient = await contract.patients(id);

    // THE FIX:
    // Check if patient ID from struct is non-zero AND the name matches.
    // patient.id is a BigInt, so we convert it.
    if (Number(patient.id) > 0 && patient.name === patientName) {
      res.status(200).json({ message: "Login Successful" });
    } else {
      res.status(400).json({ error: "Invalid Patient ID or Name" });
    }
  } catch (error) {
    console.error("Error fetching patient data:", error);
    res.status(500).json({ error: "Error fetching patient data" });
  }
}