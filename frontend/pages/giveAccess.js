import { useState } from "react";
import { useRouter } from "next/router";
import { getSignedContract, computeTxMetrics } from "../lib/ethClient";

export default function GiveAccess() {
  const router = useRouter();
  const { patientId: qPid } = router.query;
  const [patientId, setPatientId] = useState(qPid || "");
  const [doctorId, setDoctorId] = useState("");
  const [patientPrivateKey, setPatientPrivateKey] = useState(""); // Used to sign locally; never sent to the server
  const [message, setMessage] = useState("");

  const handleAccess = async (action) => {
    if (!patientPrivateKey) {
      setMessage("Please enter your private key to sign this transaction.");
      return;
    }
    setMessage("Processing...");

    const pId = parseInt(patientId, 10);
    const dId = parseInt(doctorId, 10);

    try {
      // The key stays in the browser: it signs the transaction locally and is never POSTed anywhere.
      const { provider, contract } = getSignedContract(patientPrivateKey);

      const tx =
        action === "give"
          ? await contract.giveAccess(pId, dId)
          : await contract.revokeAccess(pId, dId);
      const receipt = await tx.wait();

      const metrics = await computeTxMetrics(provider, receipt);
      console.log(
        `[METRIC - ${action === "give" ? "Give" : "Revoke"} Access] Gas: ${metrics.gasUsed}, Cost: $${metrics.costUsd}`
      );

      setMessage(action === "give" ? "Access granted successfully" : "Access revoked successfully");
    } catch (err) {
      setMessage(err.reason || err.message);
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
