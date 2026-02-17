import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function PatientDashboard() {
  const router = useRouter();
  const { patientId } = router.query;
  const [patientData, setPatientData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (patientId) {
      fetch(`/api/getPatientData?patientId=${patientId}`)
        .then(res => res.json())
        .then(data => {
            // FIX: Check if the backend returned an error
            if (data.error) {
                setError(data.error); // Show the error message
            } else {
                setPatientData(data); // Show the patient data
            }
        })
        .catch(err => setError("Failed to connect to server"));
    }
  }, [patientId]);

  // Show Error UI if something is wrong
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded shadow-lg text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Error Loading Profile</h2>
            <p className="text-gray-700">{error}</p>
            <button 
                onClick={() => router.push('/')}
                className="mt-6 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
                Go Home
            </button>
        </div>
    </div>
  );

  if (!patientData) return <div className="p-8 text-center text-xl">Loading patient profile...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
       <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-teal-700">Patient Dashboard</h1>
        
        <div className="bg-white p-6 rounded shadow mb-6">
            <h2 className="text-xl font-semibold">Hello, {patientData.name}</h2>
            <p className="text-gray-700 mt-2">Patient ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{patientData.id}</span></p>
            <p className="text-gray-700 mt-1">Wallet: <span className="font-mono text-sm break-all">{patientData.wallet}</span></p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
                onClick={() => router.push({ pathname: "/getDocument", query: { patientId } })}
                className="bg-blue-600 text-white py-4 rounded shadow hover:bg-blue-700 transition"
            >
                View My Medical Records
            </button>
            <button 
                onClick={() => router.push({ pathname: "/giveAccess", query: { patientId } })}
                className="bg-purple-600 text-white py-4 rounded shadow hover:bg-purple-700 transition"
            >
                Manage Doctor Access
            </button>
        </div>
       </div>
    </div>
  );
}