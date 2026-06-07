import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  const { patientId } = req.query;

  // THE FIX: Parse to Integer
  const pId = parseInt(patientId, 10);

  const provider = new ethers.JsonRpcProvider(providerUrl);
  const contract = new ethers.Contract(contractAddress, contractABI, provider);

  try {
    console.log("--- STARTING PATIENT READ METRICS ---");
    const t_start = performance.now(); // Start Timer

    const patient = await contract.patients(pId);
    const patientWalletAddress = patient.wallet;

    if (!patientWalletAddress || patient.id == 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const accounts = await provider.listAccounts();
    const matchingAccount = accounts.find(
      (account) => account.address.toLowerCase() === patientWalletAddress.toLowerCase()
    );

    if (!matchingAccount) {
      return res.status(403).json({ error: "Patient wallet not found in local node." });
    }

    const signer = await provider.getSigner(matchingAccount.address);
    const contractWithSigner = new ethers.Contract(contractAddress, contractABI, signer);
    const documents = await contractWithSigner.getPatientDocuments(pId);

    const t_end = performance.now(); // End Timer
    const readLatency = (t_end - t_start).toFixed(2);

    console.log(`[METRIC] Patient Data Fetch Latency: ${readLatency} ms`);
    console.log("-------------------------------------");

    // Convert BigInts
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
    res.status(500).json({ error: "Error fetching documents", details: error.message });
  }
}