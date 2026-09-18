import {
  putAkEnvelope,
  putDekEnvelope,
} from '../../../lib/keyvault-handler';

// Stores wrapped key material produced entirely in the browser.
// The server never sees a plaintext AK, DEK, or private key here — only
// sealed/wrapped ciphertext blobs. Two shapes are accepted:
//
//   { type: "ak",  patientId, identity, sealed, akVersion }
//   { type: "dek", patientId, docId, wrappedDek, nonce, cid, akVersion }
//
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type } = req.body;

    if (type === 'ak') {
      const { patientId, identity, sealed, akVersion } = req.body;
      if (patientId == null || !identity || !sealed) {
        return res.status(400).json({ error: 'Missing patientId, identity, or sealed AK envelope' });
      }
      putAkEnvelope(patientId, identity, sealed, akVersion ?? 1);
      return res.status(200).json({ success: true, stored: 'ak', identity });
    }

    if (type === 'dek') {
      const { patientId, docId, wrappedDek, nonce, cid, akVersion } = req.body;
      if (patientId == null || !docId || !wrappedDek || !nonce) {
        return res.status(400).json({ error: 'Missing patientId, docId, wrappedDek, or nonce' });
      }
      putDekEnvelope(patientId, docId, {
        wrappedDek,
        nonce,
        cid: cid ?? null,
        akVersion: akVersion ?? 1,
      });
      return res.status(200).json({ success: true, stored: 'dek', docId });
    }

    return res.status(400).json({ error: 'Unknown envelope type (expected "ak" or "dek")' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
