import { useState } from "react";

export default function Benchmark() {
  const [iterations, setIterations] = useState(10);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [fileSizeKb, setFileSizeKb] = useState(50);
  const [status, setStatus] = useState("Idle");

  const runUploadBenchmark = async () => {
    if (!patientId || !doctorId) {
      alert("Please enter a valid Patient ID and Doctor ID");
      return;
    }

    setStatus(`Running ${iterations} iterations... Please do not close this tab.`);
    const data = [];

    // Dynamically import crypto libraries for the browser
    const { encryptDocument } = await import("../lib/crypto/documentEncryption");

    // Generate a dummy file based on the KB size requested
    const dummyFileBytes = new Uint8Array(1024 * fileSizeKb);
    const dummyMetadata = { diseaseName: "Benchmark Test", description: `File size: ${fileSizeKb}KB` };
    const dummyAK = crypto.getRandomValues(new Uint8Array(32)); 
    const dummyPatientAddress = "0x1234567890123456789012345678901234567890";

    for (let i = 0; i < iterations; i++) {
      const docId = `bench-${Date.now()}-${i}`;
      setStatus(`Processing iteration ${i + 1} of ${iterations}...`);

      try {
        // --- 1. Measure Browser AES-256-GCM Encryption ---
        const t0_enc = performance.now();
        const { ipfsPayload } = await encryptDocument({
          fileBytes: dummyFileBytes,
          metadata: dummyMetadata,
          ak: dummyAK,
          patientAddress: dummyPatientAddress,
          docId: docId,
          akVersion: 1
        });
        const t1_enc = performance.now();
        const encLatency = t1_enc - t0_enc;

        // --- 2. Measure IPFS & Blockchain (API) ---
        const payloadString = JSON.stringify(ipfsPayload);
        const t0_api = performance.now();
        
        const res = await fetch("/api/uploadDocument", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: parseInt(patientId),
            doctorId: parseInt(doctorId),
            docId: docId,
            ipfsPayload: payloadString
          }),
        });
        
        const apiData = await res.json();
        const t1_api = performance.now();
        const apiLatency = t1_api - t0_api;

        // --- 3. Record Data ---
        if (res.ok) {
            // SUCCESS
            data.push({
                Iteration: i + 1,
                Status: "Success",
                FileSizeKB: fileSizeKb,
                BrowserEncryption_ms: encLatency.toFixed(2),
                IPFSUpload_ms: apiData.metrics?.ipfsLatency || 0,
                BlockchainWrite_ms: apiData.metrics?.blockchainLatency || 0,
                TotalAPITime_ms: apiLatency.toFixed(2),
                GasUsed: apiData.metrics?.gasUsed || 0,
                Cost_USD: apiData.metrics?.costUsd || 0,
            });
        } else {
            // FAILURE (Unauthorized, Node down, etc)
            data.push({
                Iteration: i + 1,
                Status: `Failed: ${apiData.error || 'Unknown Error'}`,
                FileSizeKB: fileSizeKb,
                BrowserEncryption_ms: encLatency.toFixed(2),
                IPFSUpload_ms: 0,
                BlockchainWrite_ms: 0,
                TotalAPITime_ms: apiLatency.toFixed(2),
                GasUsed: 0,
                Cost_USD: 0,
            });
        }

      } catch (err) {
        console.error(`Iteration ${i} failed:`, err);
        data.push({
            Iteration: i + 1,
            Status: "Crash: " + err.message,
            FileSizeKB: fileSizeKb,
            BrowserEncryption_ms: 0, IPFSUpload_ms: 0, BlockchainWrite_ms: 0, 
            TotalAPITime_ms: 0, GasUsed: 0, Cost_USD: 0
        });
      }
    }

    setStatus("Benchmark Complete! Downloading Excel file...");
    downloadCSV(data);
  };

  const downloadCSV = (data) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(row => 
        // Wrap values in quotes to prevent Excel formatting issues
        Object.values(row).map(val => `"${val}"`).join(",")
    ).join("\n");
    
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ZKP_EHR_Benchmark_${iterations}_runs.csv`);
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-10 flex flex-col items-center">
      <div className="bg-white p-8 rounded shadow-xl max-w-xl w-full">
        <h1 className="text-3xl font-bold mb-2 text-teal-700 text-center">Research Benchmarking</h1>
        <p className="text-gray-600 mb-6 text-center text-sm">Measure Latency, Gas, and Crypto Performance</p>
        
        <div className="space-y-4 mb-6">
            <div>
                <label className="block text-sm font-bold text-gray-700">Patient ID</label>
                <input type="number" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="p-3 border rounded w-full" placeholder="e.g. 1" />
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700">Authorized Doctor ID</label>
                <input type="number" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="p-3 border rounded w-full" placeholder="e.g. 2" />
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700">Number of Iterations</label>
                <input type="number" value={iterations} onChange={(e) => setIterations(e.target.value)} className="p-3 border rounded w-full bg-blue-50" />
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700">Test File Size (KB)</label>
                <input type="number" value={fileSizeKb} onChange={(e) => setFileSizeKb(e.target.value)} className="p-3 border rounded w-full bg-blue-50" />
            </div>
        </div>
        
        <button 
          onClick={runUploadBenchmark}
          className="bg-teal-600 text-white font-bold py-4 px-6 rounded hover:bg-teal-700 w-full shadow-lg transition"
        >
          ▶ Start Upload & Encryption Benchmark
        </button>

        <div className="mt-6 p-4 bg-gray-100 rounded border border-gray-300 text-center font-mono text-sm text-gray-800">
            {status}
        </div>
      </div>
    </div>
  );
}