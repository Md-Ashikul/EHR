import { useState } from "react";
import { useRouter } from "next/router";
import { getSignedContract, computeTxMetrics } from "../lib/ethClient";
import { useKeySession } from "../lib/crypto/keySession";

export default function GiveAccess() {
  const router = useRouter();
  const { patientId: qPid } = router.query;
  const [patientId, setPatientId] = useState(qPid || "");
  const [doctorId, setDoctorId] = useState("");
  const [patientPrivateKey, setPatientPrivateKey] = useState("");
  const [message, setMessage] = useState("");
  const { session } = useKeySession();

  const handleAccess = async (action) => {
    if (!patientPrivateKey) {
      setMessage("Please enter your ETH private key to sign the transaction.");
      return;
    }
    if (!session || session.role !== 'patient') {
      setMessage("Encryption session lost. Please log in to your patient portal again.");
      return;
    }
    setMessage("Processing cryptographic request...");

    const pId = parseInt(patientId, 10);
    const dId = parseInt(doctorId, 10);

    try {
      const { provider, contract } = getSignedContract(patientPrivateKey);
      const km = await import("../lib/crypto/keyManagement");
      await km.ready();

      if (action === "give") {
        // 1. Fetch Doctor's public key
        const pubRes = await fetch(`/api/keyvault/publicKey?identity=doctor:${dId}`);
        if (!pubRes.ok) throw new Error("Doctor has not registered their encryption keys yet.");
        const doctorRecord = await pubRes.json();
        
        // 2. Seal Patient's AK for the Doctor
        const t0 = performance.now();
        const sealed = km.sealAKForViewer(session.ak, doctorRecord.x25519Pub);
        const t1 = performance.now();
        console.log(`[METRIC] Wrap AK (Seal) Latency: ${(t1-t0).toFixed(2)} ms`);
        
        // 3. Put Envelope in Vault
        const envRes = await fetch("/api/keyvault/putEnvelope", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                type: "ak", patientId: pId, identity: `doctor:${dId}`,
                sealed, akVersion: session.akVersion
            })
        });
        if (!envRes.ok) throw new Error("Failed to save doctor's Access Key envelope.");
        
        // 4. On-Chain Grant
        const tx = await contract.giveAccess(pId, dId);
        const receipt = await tx.wait();
        const metrics = await computeTxMetrics(provider, receipt);
        console.log(`[METRIC - Grant Access] Gas: ${metrics.gasUsed}, Cost: $${metrics.costUsd}`);
        setMessage("Access granted successfully!");

      } else if (action === "revoke-soft" || action === "revoke-hard") {
        
        if (action === "revoke-soft") {
            // SOFT REVOKE: Simply delete the envelope from the server. (Doctor can't load keys on next refresh)
            const t0 = performance.now();
            const delRes = await fetch("/api/keyvault/deleteEnvelope", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({ patientId: pId, identity: `doctor:${dId}` })
            });
            if (!delRes.ok) throw new Error("Failed to delete AK envelope (Soft Revoke).");
            const t1 = performance.now();
            console.log(`[METRIC] Soft Revocation Latency: ${(t1-t0).toFixed(2)} ms`);
            
        } else {
            // HARD REVOKE: Cryptographically cut the doctor off by rotating the Master Access Key (AK)
            setMessage("Generating new keys & re-wrapping all documents (Hard Revocation)...");
            
            const newAK = km.generateAK();
            const newAkVersion = session.akVersion + 1;
            
            // Fetch all current envelopes and authorized doctors
            const envRes = await fetch(`/api/keyvault/getEnvelope?patientId=${pId}&role=patient`);
            const envData = await envRes.json();
            
            const doctorAccessList = await contract.getPatientDoctorAccess(pId);
            // Remaining = everyone except the doctor we are revoking
            const remainingDoctors = doctorAccessList.map(n => Number(n)).filter(id => id !== dId);
            
            const t0 = performance.now();
            const newAkEnvelopes = {};
            
            // Re-seal new AK for Patient themselves
            newAkEnvelopes[`patient:${pId}`] = {
                sealed: km.sealAKForViewer(newAK, session.publicKeyB64),
                akVersion: newAkVersion
            };
            
            // Re-seal new AK for remaining Doctors
            for (const rDoc of remainingDoctors) {
                const pubRes = await fetch(`/api/keyvault/publicKey?identity=doctor:${rDoc}`);
                if (pubRes.ok) {
                    const docRecord = await pubRes.json();
                    newAkEnvelopes[`doctor:${rDoc}`] = {
                        sealed: km.sealAKForViewer(newAK, docRecord.x25519Pub),
                        akVersion: newAkVersion
                    };
                }
            }
            
            // Re-wrap all Document Keys (DEKs) using the new AK
            const newDekEnvelopes = {};
            for (const [docId, dekEnv] of Object.entries(envData.dekEnvelopes)) {
                // Unwrap with OLD AK
                const rawDEK = await km.unwrapDEK(dekEnv.wrappedDek, dekEnv.nonce, session.ak);
                // Wrap with NEW AK
                const { wrappedDek, nonce } = await km.wrapDEK(rawDEK, newAK);
                newDekEnvelopes[docId] = {
                    wrappedDek, nonce, cid: dekEnv.cid, akVersion: newAkVersion
                };
            }
            const t1 = performance.now();
            console.log(`[METRIC] Hard Revocation (Key Rotation) Cryptography Latency: ${(t1-t0).toFixed(2)} ms`);
            
            // Submit complete rotation packet to Vault
            const rotRes = await fetch("/api/keyvault/rotateAK", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({ patientId: pId, akEnvelopes: newAkEnvelopes, dekEnvelopes: newDekEnvelopes })
            });
            if (!rotRes.ok) throw new Error("Failed to commit rotated keys to vault.");
            
            // Update live session
            session.ak = newAK;
            session.akVersion = newAkVersion;
        }

        // Finalize On-Chain (Same for both revocation types)
        setMessage("Finalizing Revocation on Blockchain...");
        const tx = await contract.revokeAccess(pId, dId);
        const receipt = await tx.wait();
        const metrics = await computeTxMetrics(provider, receipt);
        
        console.log(`[METRIC - Revoke Access] Gas: ${metrics.gasUsed}, Cost: $${metrics.costUsd}`);
        setMessage(`Access revoked successfully (${action === 'revoke-soft' ? 'Soft' : 'Hard'} Revocation)!`);
      }
    } catch (err) {
      setMessage("Error: " + (err.reason || err.message));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded shadow-2xl w-full max-w-lg space-y-6">
        <h2 className="text-3xl font-extrabold text-teal-800 text-center">Manage Access</h2>
        <div className="space-y-4">
          <input placeholder="Patient ID" value={patientId} onChange={e=>setPatientId(e.target.value)} className="w-full p-3 border rounded shadow-sm" />
          <input placeholder="Doctor ID" type="number" value={doctorId} onChange={e=>setDoctorId(e.target.value)} className="w-full p-3 border rounded shadow-sm" />
          <div className="bg-blue-50 p-4 border border-blue-200 rounded">
            <label className="block text-xs font-bold text-blue-700 uppercase mb-2">ETH Private Key (For Smart Contract)</label>
            <input placeholder="0x..." type="password" value={patientPrivateKey} onChange={e=>setPatientPrivateKey(e.target.value)} className="w-full p-2 border rounded" />
          </div>
        </div>
        
        <button onClick={() => handleAccess("give")} className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 font-bold rounded shadow transition">
            Grant Access
        </button>
        
        <div className="flex gap-4">
          <button onClick={() => handleAccess("revoke-soft")} className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 font-bold rounded shadow transition text-sm">
              Soft Revoke (Fast)
          </button>
          <button onClick={() => handleAccess("revoke-hard")} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 font-bold rounded shadow transition text-sm">
              Hard Revoke (Secure Re-key)
          </button>
        </div>
        
        {message && <p className="text-sm text-center mt-4 p-3 bg-gray-100 border rounded font-semibold">{message}</p>}
      </div>
    </div>
  );
}