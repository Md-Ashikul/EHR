import { useState } from "react";
import { useRouter } from "next/router";

export default function GiveAccess() {
  const router = useRouter();
  const { patientId: qPid } = router.query;
  const [patientId, setPatientId] = useState(qPid || "");
  const [doctorId, setDoctorId] = useState("");
  const [patientPrivateKey, setPatientPrivateKey] = useState(""); // Kept for local testing
  const [message, setMessage] = useState("");

  const handleAccess = async (action) => {
    setMessage("Processing...");
    const endpoint = action === "give" ? "/api/giveAccess" : "/api/revokeAccess";
    
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, doctorId, patientPrivateKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white p-8 rounded shadow-lg w-full max-w-md space-y-4">
        <h2 className="text-2xl font-bold">Manage Doctor Access</h2>
        <input placeholder="Patient ID" value={patientId} onChange={e=>setPatientId(e.target.value)} className="w-full p-2 border rounded" />
        <input placeholder="Doctor ID" type="number" value={doctorId} onChange={e=>setDoctorId(e.target.value)} className="w-full p-2 border rounded" />
        <input placeholder="Patient Private Key" type="password" value={patientPrivateKey} onChange={e=>setPatientPrivateKey(e.target.value)} className="w-full p-2 border rounded" />
        
        <div className="flex gap-4">
          <button onClick={() => handleAccess("give")} className="w-full bg-purple-600 text-white py-2 rounded">Grant Access</button>
          <button onClick={() => handleAccess("revoke")} className="w-full bg-red-600 text-white py-2 rounded">Revoke Access</button>
        </div>
        
        {message && <p className="text-sm text-center mt-2">{message}</p>}
      </div>
    </div>
  );
}