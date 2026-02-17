import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function DoctorDashboard() {
  const router = useRouter();
  const { doctorId, doctorName } = router.query;
  const [patientId, setPatientId] = useState("");

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-teal-700">Welcome, {doctorName}</h1>
            <button onClick={() => router.push('/')} className="text-red-500">Logout</button>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Manage Patient Records</h2>
          <div className="flex gap-4">
            <input
              type="number"
              placeholder="Enter Patient ID"
              className="flex-1 p-3 border rounded"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
          </div>
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => router.push({ pathname: "/uploadDocument", query: { doctorId, patientId } })}
              className="flex-1 bg-teal-600 text-white py-3 rounded hover:bg-teal-700"
            >
              Upload Document
            </button>
            <button
              onClick={() => router.push({ pathname: "/getDocument", query: { doctorId, patientId } })}
              className="flex-1 bg-blue-600 text-white py-3 rounded hover:bg-blue-700"
            >
              View Documents
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}