import fs from 'fs';
import path from 'path';

// The key vault lives at the project root, next to db.json / patients.json.
// It ONLY ever holds public keys and *wrapped* (encrypted) key material:
//   - publicKeys:  each user's X25519 public key + public Argon2id salt
//   - akEnvelopes: the per-patient Access Key (AK), sealed to each viewer's X25519 public key
//   - dekEnvelopes: each document's DEK, wrapped under the patient's AK (symmetric)
// No plaintext private key, AK, or DEK is ever stored here. (Path A / zero-trust backend.)
const vaultPath = path.join(process.cwd(), '..', 'keyvault.json');

const initialData = {
  publicKeys: {},   // identity ("patient:1" | "doctor:2") -> { x25519Pub, salt }
  akEnvelopes: {},  // patientId -> { identity -> { sealed, akVersion } }
  dekEnvelopes: {}, // patientId -> { docId -> { wrappedDek, nonce, cid, akVersion } }
};

// Canonical identity strings so we never depend on wallet-address lookups.
export function patientIdentity(patientId) {
  return `patient:${parseInt(patientId, 10)}`;
}
export function doctorIdentity(doctorId) {
  return `doctor:${parseInt(doctorId, 10)}`;
}

export function readVault() {
  try {
    if (!fs.existsSync(vaultPath)) {
      fs.writeFileSync(vaultPath, JSON.stringify(initialData, null, 2));
      return structuredClone(initialData);
    }
    const fileData = fs.readFileSync(vaultPath, 'utf8');
    const parsed = JSON.parse(fileData);
    // Make sure the top-level buckets always exist.
    return {
      publicKeys: parsed.publicKeys || {},
      akEnvelopes: parsed.akEnvelopes || {},
      dekEnvelopes: parsed.dekEnvelopes || {},
    };
  } catch (e) {
    console.error('Failed to read key vault, returning empty vault', e);
    return structuredClone(initialData);
  }
}

export function writeVault(data) {
  try {
    fs.writeFileSync(vaultPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write to key vault', e);
    throw e;
  }
}

// ---- Public key registry ------------------------------------------------ //

export function getPublicKey(identity) {
  const vault = readVault();
  return vault.publicKeys[identity] || null;
}

export function setPublicKey(identity, x25519Pub, salt) {
  const vault = readVault();
  vault.publicKeys[identity] = { x25519Pub, salt };
  writeVault(vault);
  return vault.publicKeys[identity];
}

// ---- AK envelopes (per patient, sealed per viewer) ---------------------- //

export function putAkEnvelope(patientId, identity, sealed, akVersion) {
  const vault = readVault();
  const pid = String(parseInt(patientId, 10));
  if (!vault.akEnvelopes[pid]) vault.akEnvelopes[pid] = {};
  vault.akEnvelopes[pid][identity] = { sealed, akVersion };
  writeVault(vault);
}

export function getAkEnvelope(patientId, identity) {
  const vault = readVault();
  const pid = String(parseInt(patientId, 10));
  return vault.akEnvelopes[pid]?.[identity] || null;
}

export function deleteAkEnvelope(patientId, identity) {
  const vault = readVault();
  const pid = String(parseInt(patientId, 10));
  if (vault.akEnvelopes[pid]?.[identity]) {
    delete vault.akEnvelopes[pid][identity];
    writeVault(vault);
    return true;
  }
  return false;
}

// ---- DEK envelopes (per patient, per document) -------------------------- //

export function putDekEnvelope(patientId, docId, envelope) {
  const vault = readVault();
  const pid = String(parseInt(patientId, 10));
  if (!vault.dekEnvelopes[pid]) vault.dekEnvelopes[pid] = {};
  vault.dekEnvelopes[pid][docId] = envelope; // { wrappedDek, nonce, cid, akVersion }
  writeVault(vault);
}

export function getDekEnvelopes(patientId) {
  const vault = readVault();
  const pid = String(parseInt(patientId, 10));
  return vault.dekEnvelopes[pid] || {};
}

// Hard-revoke helper: atomically replace a patient's AK + DEK envelopes with a
// freshly re-wrapped set (new AK version). Any viewer not present in
// newAkEnvelopes is dropped (that is how a doctor is cryptographically cut off).
export function replacePatientEnvelopes(patientId, newAkEnvelopes, newDekEnvelopes) {
  const vault = readVault();
  const pid = String(parseInt(patientId, 10));
  vault.akEnvelopes[pid] = newAkEnvelopes;
  vault.dekEnvelopes[pid] = newDekEnvelopes;
  writeVault(vault);
}
