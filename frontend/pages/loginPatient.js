import { useState } from "react";
import { useRouter } from "next/router";
import { useKeySession } from "../lib/crypto/keySession";

export default function LoginPatient() {
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();
  const { unlock } = useKeySession();

  const handleLogin = async () => {
    setError("");
    if (!passphrase) {
      setError("Enter your encryption passphrase.");
      return;
    }
    try {
      setStatus("Checking patient...");
      const res = await fetch("/api/validatePatient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, patientName }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      setStatus("Unlocking your encryption keys...");
      await unlock({ role: "patient", id: patientId, passphrase });
      setPassphrase("");

      router.push({ pathname: "/patientDashboard", query: { patientId, patientName } });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setStatus("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6">Patient Login</h1>
        <input className="w-full p-3 border mb-4" placeholder="Patient ID" onChange={(e) => setPatientId(e.target.value)} />
        <input className="w-full p-3 border mb-4" placeholder="Patient Name" onChange={(e) => setPatientName(e.target.value)} />
        <label htmlFor="patient-passphrase" className="sr-only">Encryption passphrase</label>
        <input
          id="patient-passphrase"
          type="password"
          autoComplete="current-password"
          className="w-full p-3 border mb-2"
          placeholder="Encryption passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Your first login sets this passphrase. It never leaves your browser and cannot be recovered, so keep it safe.
        </p>
        <button
          onClick={handleLogin}
          disabled={Boolean(status)}
          className="w-full py-3 bg-teal-600 text-white rounded disabled:opacity-60"
        >
          {status || "Login"}
        </button>
        {error && <p className="text-red-500 mt-4 text-center" role="alert">{error}</p>}
      </div>
    </div>
  );
}
