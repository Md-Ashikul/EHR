import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useKeySession } from "../lib/crypto/keySession";

export default function UploadDocument() {
  const router = useRouter();
  const { session } = useKeySession();
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [diseaseName, setDiseaseName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedDoctorId = localStorage.getItem("doctorId");
    if (router.isReady) {
      const urlDoctorId = router.query.doctorId;
      const urlPatientId = router.query.patientId;
      if (storedDoctorId) setDoctorId(storedDoctorId);
      else if (urlDoctorId) setDoctorId(urlDoctorId);
      if (urlPatientId) setPatientId(urlPatientId);
    }
  }, [router.isReady, router.query]);

  const handleImageChange = (e) => setImageFile(e.target.files[0]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!session) {
      setMessage("Error: Encryption session lost. Please log in again.");
      return;
    }

    // --- STRICT RULE: ONLY DOCTORS CAN UPLOAD ---
    if (session.role !== "doctor") {
      setMessage("Error: Access denied. Only authorized doctors can upload patient records.");
      return;
    }

    if (!doctorId) {
      setMessage("Error: Doctor ID required.");
      return;
    }

    if (!imageFile) {
      setMessage("Please select a file.");
      return;
    }

    setMessage("Encrypting and uploading...");
    const docId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      // 1. Get Patient Wallet Address (used as Authenticated Data binding)
      const pRes = await fetch(`/api/getPatientData?patientId=${patientId}`);
      if (!pRes.ok) throw new Error("Could not fetch patient wallet");
      const pData = await pRes.json();
      const patientAddress = pData.wallet;

      // 2. Resolve Access Key (AK) for Encryption
      let ak, akVersion;
      const km = await import("../lib/crypto/keyManagement");
      await km.ready();

      // --- STRICT RULE: Doctor fetches the patient's AK envelope to encrypt the new document ---
      // If the patient hasn't granted access, this fetch will fail (404/403)
      const envRes = await fetch(`/api/keyvault/getEnvelope?patientId=${patientId}&role=doctor&doctorId=${doctorId}`);
      if (!envRes.ok) throw new Error("Access Denied: You have not been granted permission by this patient to upload records.");
      
      const envData = await envRes.json();
      // Doctor decrypts the patient's Access Key in their browser using their private key
      ak = km.openAKEnvelope(envData.akEnvelope.sealed, session.publicKeyB64, session.privateKey);
      akVersion = envData.akEnvelope.akVersion;

      // 3. Encrypt File Locally in Browser
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const fileBytes = new Uint8Array(reader.result);
          const metadata = { diseaseName, description, fileName: imageFile.name, mimeType: imageFile.type };
          
          const { encryptDocument } = await import("../lib/crypto/documentEncryption");
          
          const t0 = performance.now();
          const { ipfsPayload, dekEnvelope } = await encryptDocument({
             fileBytes, metadata, ak, patientAddress, docId, akVersion
          });
          const t1 = performance.now();
          
          const payloadString = JSON.stringify(ipfsPayload);
          
          console.log(`[METRIC] Browser AES-256-GCM Encryption Latency: ${(t1 - t0).toFixed(2)} ms`);
          console.log(`[METRIC] Plaintext Size (File): ${fileBytes.length} bytes`);
          console.log(`[METRIC] Ciphertext JSON Size (Stored on IPFS): ${new Blob([payloadString]).size} bytes`);

          // 4. Upload Encrypted JSON to IPFS & Record to Blockchain
          const res = await fetch("/api/uploadDocument", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ patientId, doctorId, docId, ipfsPayload: payloadString }),
          });
          const data = await res.json();
          if(!res.ok) throw new Error(data.error);

          // 5. Store DEK Envelope to Key Vault
          const dekRes = await fetch("/api/keyvault/putEnvelope", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  type: "dek", patientId, docId,
                  wrappedDek: dekEnvelope.wrappedDek, nonce: dekEnvelope.nonce,
                  cid: data.imageCID, akVersion
              })
          });
          if (!dekRes.ok) throw new Error("Failed to save Document Key envelope.");
          
          setMessage("Success! Encrypted CID: " + data.imageCID);
        } catch(err) {
          setMessage("Encryption/Upload Error: " + err.message);
        }
      };
      reader.readAsArrayBuffer(imageFile);

    } catch (error) {
      setMessage("Error: " + error.message);
    }
  };

  // --- Render logic prevents patients from even seeing the form ---
  if (session && session.role !== "doctor") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white p-8 rounded shadow-lg max-w-md text-center text-red-600 font-bold">
          🚫 Access Restricted: Only doctors can upload medical documents.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-lg w-full max-w-md space-y-4">
        <h2 className="text-2xl font-bold mb-4 text-teal-800">Doctor Portal — Upload Record</h2>
        <input placeholder="Patient ID" value={patientId} onChange={e=>setPatientId(e.target.value)} className="w-full p-2 border rounded" required />
        
        {/* Hidden Doctor ID input, or keep it visible if you need manual entry */}
        <input placeholder="Doctor ID" value={doctorId} onChange={e=>setDoctorId(e.target.value)} className="w-full p-2 border rounded" required />
        
        <input placeholder="Disease Name / Diagnosis" value={diseaseName} onChange={e=>setDiseaseName(e.target.value)} className="w-full p-2 border rounded" required />
        <textarea placeholder="Clinical Description" value={description} onChange={e=>setDescription(e.target.value)} className="w-full p-2 border rounded" required />
        <input type="file" onChange={handleImageChange} className="w-full p-2 border rounded bg-gray-50" required />
        
        <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 font-bold rounded shadow transition">
          Encrypt & Upload Record
        </button>
        
        {message && (
          <p className={`text-sm mt-4 p-3 rounded ${message.includes("Error") || message.includes("Denied") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}