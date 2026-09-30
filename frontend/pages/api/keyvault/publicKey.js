import { getPublicKey, setPublicKey } from '../../../lib/keyvault-handler';

// Public-key registry for X25519 identities. Only PUBLIC material is stored:
// the X25519 public key and the public Argon2id salt used to re-derive it.
//
//   GET  /api/keyvault/publicKey?identity=patient:1
//        -> 200 { x25519Pub, salt } | 404
//   POST /api/keyvault/publicKey  { identity, publicKey, salt }
//        -> 201 on first publish, 200 if the same key is re-published,
//           409 if a DIFFERENT key already exists (keys are write-once so a
//           caller cannot silently swap someone's key and intercept future AK seals).

const IDENTITY_RE = /^(patient|doctor):\d+$/;

function decodedLength(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return -1;
  return Buffer.from(b64, 'base64').length;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const identity = req.query.identity;
      if (!IDENTITY_RE.test(identity || '')) {
        return res.status(400).json({ error: 'Invalid identity' });
      }
      const record = getPublicKey(identity);
      if (!record) return res.status(404).json({ error: 'No public key for this identity' });
      return res.status(200).json({ identity, ...record });
    }

    if (req.method === 'POST') {
      const { identity, publicKey, salt } = req.body || {};
      if (!IDENTITY_RE.test(identity || '')) {
        return res.status(400).json({ error: 'Invalid identity' });
      }
      if (decodedLength(publicKey) !== 32) {
        return res.status(400).json({ error: 'publicKey must be a base64 32-byte X25519 key' });
      }
      if (decodedLength(salt) !== 16) {
        return res.status(400).json({ error: 'salt must be a base64 16-byte Argon2id salt' });
      }

      const existing = getPublicKey(identity);
      if (existing) {
        if (existing.x25519Pub === publicKey && existing.salt === salt) {
          return res.status(200).json({ success: true, identity, created: false });
        }
        return res.status(409).json({ error: 'A different public key is already registered for this identity' });
      }

      setPublicKey(identity, publicKey, salt);
      return res.status(201).json({ success: true, identity, created: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
