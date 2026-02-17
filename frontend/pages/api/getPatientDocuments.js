import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  const { patientId } = req.query;
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const contract = new ethers.Contract(contractAddress, contractABI, provider);

  try {
    // 1. Fetch the patient's wallet address
    const patient = await contract.patients(patientId);
    const patientWalletAddress = patient.wallet;

    if (!patientWalletAddress || patient.id == 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // 2. Get all Hardhat accounts
    const accounts = await provider.listAccounts();

    // 3. Find the signer that matches the patient's wallet
    const matchingAccount = accounts.find(
      (account) => account.address.toLowerCase() === patientWalletAddress.toLowerCase()
    );

    if (!matchingAccount) {
      return res.status(403).json({ error: "Patient wallet not found in local Hardhat node. Cannot impersonate." });
    }

    // 4. Get the signer from their address
    const signer = await provider.getSigner(matchingAccount.address);

    // 5. Call the contract *as the patient*
    const contractWithSigner = new ethers.Contract(contractAddress, contractABI, signer);
    const documents = await contractWithSigner.getPatientDocuments(patientId);

    // ---------------------------------------------------------------- //
    // THE FIX: Convert BigInts before sending
    // ---------------------------------------------------------------- //
    const serializableDocuments = documents.map(doc => ({
      patientId: Number(doc.patientId),
      doctorId: Number(doc.doctorId),
      cid: doc.cid,
      diseaseName: doc.diseaseName,
      description: doc.description,
      imageCID: doc.imageCID,
      timestamp: Number(doc.timestamp)
    }));
    
    res.status(200).json(serializableDocuments);

  } catch (error) {
    console.error("Error in getPatientDocuments:", error);
    res.status(500).json({ error: "Error fetching documents", details: error.message });
  }
}