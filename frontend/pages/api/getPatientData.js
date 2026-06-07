import { ethers } from "ethers";
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { patientId } = req.query;
  
  // THE FIX: Parse to Integer
  const pId = parseInt(patientId, 10);

  if (!pId || isNaN(pId)) {
    return res.status(400).json({ error: "Patient ID is required" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const readContract = new ethers.Contract(contractAddress, contractABI, provider);

    const patient = await readContract.patients(pId);

    if (patient.id.toString() === "0") {
      return res.status(404).json({ error: "Patient not found on blockchain" });
    }

    let doctorAccess = [];
    const accounts = await provider.listAccounts();
    const patientAccount = accounts.find(
        (acc) => acc.address.toLowerCase() === patient.wallet.toLowerCase()
    );

    if (patientAccount) {
        const signer = await provider.getSigner(patientAccount.address);
        const connectedContract = new ethers.Contract(contractAddress, contractABI, signer);
        
        const accessData = await connectedContract.getPatientDoctorAccess(pId);
        // Clean BigInts
        doctorAccess = accessData.map((id) => Number(id));
    }

    res.status(200).json({
      id: Number(patient.id),
      name: patient.name,
      wallet: patient.wallet,
      doctorAccess: doctorAccess,
    });

  } catch (error) {
    res.status(500).json({ error: error.reason || "Error retrieving data" });
  }
}