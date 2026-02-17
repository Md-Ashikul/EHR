import { useState } from "react";
import { useRouter } from "next/router";

export default function Admin() {
  const [message, setMessage] = useState("");
  const [patientName, setPatientName] = useState("");
  const [wallet, setWallet] = useState("");
  const [patientId, setPatientId] = useState(null);
  const router = useRouter();

  const handleRegisterPatient = async () => {
    setMessage("Registering...");
    try {
        const response = await fetch("/api/registerPatient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: patientName, wallet }),
        });

        const data = await response.json();
        if(response.ok) {
            setMessage(data.message);
            setPatientId(data.patientId);
        } else {
            setMessage("Error: " + data.error);
        }
    } catch (error) {
        setMessage("Error connecting to server");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <button onClick={() => router.push("/")} className="mb-6 text-blue-600 hover:underline">
        &larr; Back to Home
      </button>

      <h1 className="text-3xl font-bold text-center mb-8 text-blue-800">Admin Panel</h1>

      <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">Register New Patient</h2>
        <div className="space-y-4">
          <input
            className="w-full p-3 border border-gray-300 rounded"
            type="text"
            placeholder="Patient Name"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
          />
          <input
            className="w-full p-3 border border-gray-300 rounded"
            type="text"
            placeholder="Wallet Address"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
          <button
            onClick={handleRegisterPatient}
            className="w-full py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Register Patient
          </button>
        </div>

        {message && <p className="mt-4 text-center font-semibold">{message}</p>}
        {patientId && (
          <div className="mt-4 p-4 bg-green-100 text-green-800 rounded text-center">
            Patient Registered! ID: <strong>{patientId}</strong>
          </div>
        )}
      </div>
    </div>
  );
}