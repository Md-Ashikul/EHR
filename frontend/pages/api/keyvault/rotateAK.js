import { replacePatientEnvelopes } from '../../../lib/keyvault-handler';

// Hard revoke: the patient's browser generates a NEW Access Key (AK), re-wraps
// every DEK under it, and re-seals the new AK for every viewer that should
// keep access (i.e. everyone EXCEPT the revoked doctor). It sends the complete
// replacement set here, and we swap it in atomically.
//
// Files on IPFS are never re-uploaded — only the (key-sized) envelopes change.
//
// Body:
//   {
//     patientId,
//     akEnvelopes:  { identity -> { sealed, akVersion } },   // remaining viewers only
//     dekEnvelopes: { docId -> { wrappedDek, nonce, cid, akVersion } }
//   }
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { patientId, akEnvelopes, dekEnvelopes } = req.body;

    if (patientId == null || !akEnvelopes || !dekEnvelopes) {
      return res.status(400).json({ error: 'Missing patientId, akEnvelopes, or dekEnvelopes' });
    }

    if (typeof akEnvelopes !== 'object' || typeof dekEnvelopes !== 'object') {
      return res.status(400).json({ error: 'akEnvelopes and dekEnvelopes must be objects' });
    }

    replacePatientEnvelopes(patientId, akEnvelopes, dekEnvelopes);

    return res.status(200).json({
      success: true,
      patientId: parseInt(patientId, 10),
      viewers: Object.keys(akEnvelopes),
      documents: Object.keys(dekEnvelopes).length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
