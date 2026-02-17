import { useState } from "react";
import { useRouter } from "next/router";

export default function LoginPatient() {
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    const res = await fetch("/api/validatePatient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, patientName }),
    });
    const data = await res.json();

    if (data.error) setError(data.error);
    else router.push({ pathname: "/patientDashboard", query: { patientId, patientName } });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6">Patient Login</h1>
        <input className="w-full p-3 border mb-4" placeholder="Patient ID" onChange={(e) => setPatientId(e.target.value)} />
        <input className="w-full p-3 border mb-4" placeholder="Patient Name" onChange={(e) => setPatientName(e.target.value)} />
        <button onClick={handleLogin} className="w-full py-3 bg-teal-600 text-white rounded">Login</button>
        {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
      </div>
    </div>
  );
}