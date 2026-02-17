import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
  const { patientId, doctorId } = req.query;
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const contract = new ethers.Contract(contractAddress, contractABI, provider);

  try {
    const isAuthorized = await contract.isDoctorAuthorized(patientId, doctorId);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    const documents = await contract.getPateintDocumentsByDoctor(patientId, doctorId);

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

  } catch (error)
 {
    res.status(500).json({ error: "Error fetching documents", details: error.message });
  }
}