import { ethers } from 'ethers';
import { contractAddress, contractABI, providerUrl } from '../../../lib/constants';
import {
  getAkEnvelope,
  getDekEnvelopes,
  patientIdentity,
  doctorIdentity,
} from '../../../lib/keyvault-handler';

// Returns the wrapped key material a viewer needs to decrypt a patient's
// documents: the viewer's own AK envelope (sealed to their X25519 key) plus
// every DEK envelope for that patient.
//
// Access is gated against the ON-CHAIN authority (defense in depth — the AK
// envelope is sealed to the viewer's public key, so a wrong caller could not
// decrypt it anyway):
//   - The patient may always fetch their own envelopes.
//   - A doctor is allowed only while isDoctorAuthorized(patientId, doctorId)
//     is true on-chain. Soft-revoke deletes their AK envelope; hard-revoke
//     rotates the AK. Either way this route stops serving a usable key.
//
// Query: /api/keyvault/getEnvelope?patientId=1&role=doctor&doctorId=2
//        /api/keyvault/getEnvelope?patientId=1&role=patient
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const patientId = parseInt(req.query.patientId, 10);
    const role = req.query.role;

    if (Number.isNaN(patientId) || !role) {
      return res.status(400).json({ error: 'Missing patientId or role' });
    }

    let identity;

    if (role === 'patient') {
      identity = patientIdentity(patientId);
    } else if (role === 'doctor') {
      const doctorId = parseInt(req.query.doctorId, 10);
      if (Number.isNaN(doctorId)) {
        return res.status(400).json({ error: 'Missing doctorId' });
      }

      // Authoritative check: is this doctor currently granted on-chain?
      const provider = new ethers.JsonRpcProvider(providerUrl);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const authorized = await contract.isDoctorAuthorized(patientId, doctorId);
      if (!authorized) {
        return res.status(403).json({ error: 'Doctor is not authorized for this patient' });
      }

      identity = doctorIdentity(doctorId);
    } else {
      return res.status(400).json({ error: 'Unknown role (expected "patient" or "doctor")' });
    }

    const akEnvelope = getAkEnvelope(patientId, identity);
    if (!akEnvelope) {
      // No AK envelope => this viewer has no (or a revoked) key wrap.
      return res.status(404).json({ error: 'No access-key envelope for this viewer' });
    }

    const dekEnvelopes = getDekEnvelopes(patientId);

    return res.status(200).json({
      success: true,
      identity,
      akEnvelope,        // { sealed, akVersion }
      dekEnvelopes,      // { docId -> { wrappedDek, nonce, cid, akVersion } }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
