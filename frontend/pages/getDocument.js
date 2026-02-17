import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { ipfsProtocol, ipfsHost, ipfsGatewayPort } from "../lib/constants"; // CHANGED

export default function GetDocuments() {
  const router = useRouter();
  const { patientId, doctorId } = router.query;
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [doctorPrivateKey, setDoctorPrivateKey] = useState(""); // For delete
  const isDoctor = !!doctorId;

  const fetchDocs = () => {
    if (!patientId) return;
    const url = isDoctor
      ? `/api/getDocumentsByDoctor?patientId=${patientId}&doctorId=${doctorId}`
      : `/api/getPatientDocuments?patientId=${patientId}`; // This API might fail due to contract auth

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Unauthorized or Not Found. (If patient, API auth may be failing)");
        return res.json();
      })
      .then(data => setDocuments(data))
      .catch(err => setError(err.message));
  };

  useEffect(fetchDocs, [patientId, doctorId, isDoctor]);

  const handleDelete = async (docIndex) => {
    if (!doctorPrivateKey) {
      alert("Please enter your private key to delete.");
      return;
    }
    setError("Deleting...");
    try {
      const res = await fetch("/api/deleteDocument", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, docIndex, doctorPrivateKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setError("Document deleted successfully.");
      fetchDocs(); // Refresh list
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <button onClick={() => router.back()} className="mb-4 text-blue-600">Back</button>
      <h1 className="text-3xl font-bold mb-6">Medical Records (Patient {patientId})</h1>
      {error && <p className="text-red-500">{error}</p>}

      {isDoctor && (
        <div className="mb-4 p-4 bg-yellow-100 rounded">
          <input
            type="password"
            placeholder="Enter Doctor Private Key (for deletion)"
            className="w-full p-2 border rounded"
            value={doctorPrivateKey}
            onChange={e => setDoctorPrivateKey(e.target.value)}
          />
        </div>
      )}

      <div className="grid gap-6">
        {documents.map((doc, i) => (
          <div key={i} className="bg-white p-6 rounded shadow flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-teal-600">{doc.diseaseName}</h3>
              <p className="text-gray-700 mt-2">{doc.description}</p>
              <p className="text-xs text-gray-400 mt-4">CID: {doc.imageCID}</p>
            </div>
            <div className="w-full md:w-64 h-48 bg-gray-200 rounded overflow-hidden">
              <img
                src={`${ipfsProtocol}://${ipfsHost}:${ipfsGatewayPort}/ipfs/${doc.imageCID}`} // CHANGED
                alt="Medical Record"
                className="w-full h-full object-cover"
              />
            </div>
            {isDoctor && (
              <button
                onClick={() => handleDelete(i)}
                className="bg-red-500 text-white px-3 py-1 rounded h-fit"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}