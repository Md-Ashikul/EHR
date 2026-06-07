import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  const { patientId, doctorId } = req.query;

  // THE FIX: Parse to Integers
  const pId = parseInt(patientId, 10);
  const dId = parseInt(doctorId, 10);

  const provider = new ethers.JsonRpcProvider(providerUrl);
  const contract = new ethers.Contract(contractAddress, contractABI, provider);

  try {
    console.log("--- STARTING DOCTOR READ METRICS ---");
    const t_start = performance.now(); // Start Timer

    const isAuthorized = await contract.isDoctorAuthorized(pId, dId);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    const documents = await contract.getPateintDocumentsByDoctor(pId, dId);

    const t_end = performance.now(); // End Timer
    const readLatency = (t_end - t_start).toFixed(2);

    console.log(`[METRIC] Data Fetch Latency: ${readLatency} ms`);
    console.log("------------------------------------");

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