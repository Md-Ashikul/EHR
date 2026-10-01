import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { ipfsProtocol, ipfsHost, ipfsGatewayPort } from "../lib/constants";
import { getSignedContract, computeTxMetrics } from "../lib/ethClient";
import { useKeySession } from "../lib/crypto/keySession";

export default function GetDocuments() {
  const router = useRouter();
  const { patientId, doctorId } = router.query;
  const { session } = useKeySession();
  const [documents, setDocuments] = useState([]);
  const [decryptedDocs, setDecryptedDocs] = useState({});
  const [error, setError] = useState("");
  const [doctorPrivateKey, setDoctorPrivateKey] = useState("");
  const isDoctor = !!doctorId;

  const fetchDocs = async () => {
    if (!patientId || !session) return;
    setError("");

    const url = isDoctor
      ? `/api/getDocumentsByDoctor?patientId=${patientId}&doctorId=${doctorId}`
      : `/api/getPatientDocuments?patientId=${patientId}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Unauthorized or Patient Not Found.");
      const docs = await res.json();
      setDocuments(docs);

      if (docs.length === 0) return;

      // 1. Get Patient Wallet Address (used as Authenticated Data binding)
      const pRes = await fetch(`/api/getPatientData?patientId=${patientId}`);
      const pData = await pRes.json();
      const patientAddress = pData.wallet;

      // 2. Fetch required key material (AK envelope & DEK envelopes)
      const envUrl = isDoctor 
          ? `/api/keyvault/getEnvelope?patientId=${patientId}&role=doctor&doctorId=${doctorId}`
          : `/api/keyvault/getEnvelope?patientId=${patientId}&role=patient`;
      
      const envRes = await fetch(envUrl);
      if (!envRes.ok) throw new Error("Failed to load key envelopes (Access may be revoked)");
      const envData = await envRes.json();

      const km = await import("../lib/crypto/keyManagement");
      const { decryptDocument } = await import("../lib/crypto/documentEncryption");
      await km.ready();

      // 3. Unwrap the patient's Access Key (AK)
      let ak;
      if (session.role === 'patient') {
         ak = session.ak; // patients already hold their AK in memory
      } else {
         ak = km.openAKEnvelope(envData.akEnvelope.sealed, session.publicKeyB64, session.privateKey);
      }

      // 4. Attempt to decrypt each document locally in browser
      const decMap = {};
      for (const doc of docs) {
         const dekEnvelope = envData.dekEnvelopes[doc.docId];
         if (!dekEnvelope) {
            decMap[doc.docId] = { error: "No Document Key found. Access might be revoked or pending." };
            continue;
         }

         try {
            // Fetch raw encrypted JSON from IPFS
            const ipfsRes = await fetch(`${ipfsProtocol}://${ipfsHost}:${ipfsGatewayPort}/ipfs/${doc.cid}`);
            if (!ipfsRes.ok) throw new Error("Failed to fetch encrypted payload from IPFS");
            const ipfsPayload = await ipfsRes.json();

            // Decrypt in browser
            const t0 = performance.now();
            const { fileBytes, metadata } = await decryptDocument({
               ipfsPayload, dekEnvelope, ak, patientAddress, docId: doc.docId
            });
            const t1 = performance.now();
            console.log(`[METRIC] Decryption Latency for doc [${doc.docId}]: ${(t1 - t0).toFixed(2)} ms`);

            // Create temporary browser Blob URL for preview
            const blobUrl = URL.createObjectURL(new Blob([fileBytes], { type: metadata.mimeType || "image/jpeg" }));
            decMap[doc.docId] = { blobUrl, metadata };
         } catch (e) {
            console.error(`Decryption failed for ${doc.docId}:`, e);
            decMap[doc.docId] = { error: "Decryption Failed (Invalid key or tampered data)" };
         }
      }
      setDecryptedDocs(decMap);

    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { fetchDocs(); }, [patientId, doctorId, isDoctor, session]);

  const handleDelete = async (docId) => {
    if (!doctorPrivateKey) { alert("Please enter your ETH private key to delete on-chain."); return; }
    setError("Deleting...");
    try {
      const { provider, contract } = getSignedContract(doctorPrivateKey);
      const tx = await contract.deleteDocument(parseInt(patientId, 10), docId);
      const receipt = await tx.wait();
      const metrics = await computeTxMetrics(provider, receipt);
      console.log(`[METRIC - Delete] Gas: ${metrics.gasUsed}, Cost: $${metrics.costUsd}`);
      setError("Document deleted successfully.");
      fetchDocs();
    } catch (err) {
      setError(err.reason || err.message);
    }
  };

  if (!session) return <div className="p-8 text-center text-red-600 font-bold">Please log in to load encryption keys.</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <button onClick={() => router.back()} className="mb-4 text-blue-600 hover:underline">← Back</button>
      <h1 className="text-3xl font-bold mb-6">Medical Records (Patient {patientId})</h1>
      {error && <p className="text-red-600 bg-red-100 p-4 rounded font-bold mb-4">{error}</p>}
      
      {isDoctor && (
        <div className="mb-6 p-4 bg-yellow-100 rounded shadow border border-yellow-300">
          <label className="block text-sm font-bold text-yellow-800 mb-2">ETH Private Key (For Deletion On-Chain Only)</label>
          <input
            type="password"
            placeholder="0x..."
            className="w-full p-2 border rounded focus:ring-yellow-500"
            value={doctorPrivateKey}
            onChange={e => setDoctorPrivateKey(e.target.value)}
          />
        </div>
      )}

      {documents.length === 0 && !error && <p>No documents found.</p>}

      <div className="grid gap-6">
        {documents.map((doc, i) => {
          const dec = decryptedDocs[doc.docId];
          return (
            <div key={i} className="bg-white p-6 rounded-lg shadow-md flex flex-col md:flex-row gap-6 border-t-4 border-teal-500">
              <div className="flex-1">
                {dec?.error ? (
                  <div className="text-red-700 bg-red-50 p-4 border border-red-200 rounded font-semibold flex items-center h-full">
                    🔒 {dec.error}
                  </div>
                ) : dec?.metadata ? (
                  <>
                    <h3 className="text-2xl font-bold text-teal-700">{dec.metadata.diseaseName}</h3>
                    <p className="text-gray-700 mt-2 text-lg">{dec.metadata.description}</p>
                    {dec.metadata.fileName && <p className="text-sm text-gray-500 mt-2">File: {dec.metadata.fileName}</p>}
                  </>
                ) : (
                  <div className="flex items-center h-full">
                    <p className="text-gray-500 font-semibold animate-pulse">Decrypting secure payload...</p>
                  </div>
                )}
                <div className="mt-4 p-3 bg-gray-50 rounded border text-xs text-gray-400 break-all font-mono">
                  <p>On-Chain CID: {doc.cid}</p>
                  <p>Document ID: {doc.docId}</p>
                </div>
              </div>
              
              <div className="w-full md:w-64 h-48 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border">
                {dec?.blobUrl ? (
                  <img src={dec.blobUrl} alt="Medical Record" className="w-full h-full object-cover" />
                ) : dec?.error ? (
                  <span className="text-red-500 text-sm font-bold">Encrypted / No Access</span>
                ) : (
                  <span className="text-gray-400">Loading...</span>
                )}
              </div>
              
              {isDoctor && (
                <button
                  onClick={() => handleDelete(doc.docId)}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded h-fit font-bold transition shadow"
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}