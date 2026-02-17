import { ethers } from "ethers";
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { patientId } = req.query;

  if (!patientId) {
    return res.status(400).json({ error: "Patient ID is required" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(providerUrl);
    
    // 1. Standard Read Contract (for public data)
    const readContract = new ethers.Contract(contractAddress, contractABI, provider);

    // 2. Fetch patient struct (Public data, so this works)
    const patient = await readContract.patients(patientId);

    // Check if patient exists
    if (patient.id.toString() === "0") {
      return res.status(404).json({ error: "Patient not found on blockchain" });
    }

    // ---------------------------------------------------------
    // THE FIX: IMPERSONATE PATIENT FOR RESTRICTED DATA
    // ---------------------------------------------------------
    
    let doctorAccess = [];

    // Get all accounts from the local node
    const accounts = await provider.listAccounts();

    // Find the account that matches the patient's wallet
    const patientAccount = accounts.find(
        (acc) => acc.address.toLowerCase() === patient.wallet.toLowerCase()
    );

    if (patientAccount) {
        // If we found the wallet locally, create a signer
        const signer = await provider.getSigner(patientAccount.address);
        
        // Create a NEW contract instance connected to this signer
        const connectedContract = new ethers.Contract(contractAddress, contractABI, signer);
        
        // Now this call will succeed because msg.sender == patient.wallet
        const accessData = await connectedContract.getPatientDoctorAccess(patientId);
        
        // Convert BigInts to Numbers immediately
        doctorAccess = accessData.map((id) => Number(id));
    } else {
        console.warn("Patient wallet not found in local node. Cannot fetch access list.");
        // We return an empty list instead of crashing if we can't sign as the patient
    }

    // ---------------------------------------------------------

    res.status(200).json({
      id: Number(patient.id),
      name: patient.name,
      wallet: patient.wallet,
      doctorAccess: doctorAccess,
    });

  } catch (error) {
    console.error("Error in getPatientData:", error);
    // Provide a cleaner error message
    res.status(500).json({ error: error.reason || "Server error fetching patient data" });
  }
}