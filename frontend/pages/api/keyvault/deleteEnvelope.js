import { deleteAkEnvelope } from '../../../lib/keyvault-handler';

// Endpoint for Soft Revocation
// Deletes the specified identity's AK envelope from the vault, preventing them from fetching it again.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { patientId, identity } = req.body;
    
    if (patientId == null || !identity) {
        return res.status(400).json({ error: 'Missing patientId or identity parameters' });
    }
    
    const success = deleteAkEnvelope(patientId, identity);
    
    if (success) {
        return res.status(200).json({ success: true, message: "Envelope deleted successfully." });
    } else {
        return res.status(404).json({ error: 'Envelope not found or already deleted.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}