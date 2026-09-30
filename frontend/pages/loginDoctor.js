import { useState } from "react";
import { useRouter } from "next/router";
import { useKeySession } from "../lib/crypto/keySession";

export default function LoginDoctor() {
  const [doctorId, setDoctorId] = useState("");
  const [password, setPassword] = useState("");
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
      setStatus("Checking credentials...");
      const res = await fetch("/api/loginDoctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, password }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setStatus("Unlocking your encryption keys...");
        await unlock({ role: "doctor", id: data.doctorId, passphrase });
        setPassphrase("");

        // --- THE FIX: Save to browser memory so it's never lost ---
        localStorage.setItem("doctorId", data.doctorId);
        localStorage.setItem("doctorName", data.doctorName);
        
        // Redirect to dashboard
        router.push({
          pathname: "/doctorDashboard",
          query: { doctorId: data.doctorId, doctorName: data.doctorName },
        });
      }
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setStatus("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-xl">
        <h1 className="text-4xl font-extrabold text-teal-600 mb-6 text-center">Doctor Login</h1>
        
        <div className="space-y-4">
          <input
            type="number"
            placeholder="Doctor ID"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          />
          <label htmlFor="doctor-passphrase" className="sr-only">Encryption passphrase</label>
          <input
            id="doctor-passphrase"
            type="password"
            autoComplete="off"
            placeholder="Encryption passphrase (separate from password)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 leading-relaxed">
            Your first login sets this passphrase. It never leaves your browser and cannot be recovered.
          </p>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleLogin}
            disabled={Boolean(status)}
            className="w-full py-3 mt-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition disabled:opacity-60"
          >
            {status || "Login"}
          </button>
          
          <div className="text-center mt-4">
            <p className="text-sm text-gray-600">New Doctor?</p>
            <button 
                onClick={() => router.push('/registerDoctor')}
                className="text-teal-600 font-bold hover:underline"
            >
                Register Here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}