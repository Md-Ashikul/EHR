// keyManagement.js — browser-only key material for the EHR encryption scheme.
//
// This module NEVER runs on the server. It handles:
//   1. Argon2id passphrase -> X25519 identity keypair derivation (deterministic).
//   2. Access Key (AK) generation (per-patient symmetric key).
//   3. Wrapping/unwrapping the AK for a viewer via X25519 sealed boxes (libsodium).
//   4. Wrapping/unwrapping a document key (DEK) under the AK via AES-256-GCM (Web Crypto).
//
// Trust model (Path A): private keys and plaintext keys exist only in browser memory.
// The server and IPFS only ever receive the outputs of the wrap functions (ciphertext).

import _sodium from "libsodium-wrappers-sumo"

let sodium = null

// Resolve once libsodium's WASM is initialized. Call (and await) before any op below.
export async function ready() {
  if (sodium) return sodium
  await _sodium.ready
  sodium = _sodium
  return sodium
}

// ---------- base64 helpers (standard variant, so it round-trips through JSON/HTTP) ----------

export function toB64(bytes) {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL)
}

export function fromB64(str) {
  return sodium.from_base64(str, sodium.base64_variants.ORIGINAL)
}

// ---------- identity: passphrase -> X25519 keypair ----------

// A fresh, public, per-user salt. Stored in the vault alongside the public key.
export function generateSalt() {
  return toB64(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES))
}

// Deterministically derive an X25519 keypair from (passphrase, salt).
// Same inputs always produce the same keys, so the private key never has to be stored.
export async function deriveKeypairFromPassphrase(passphrase, saltB64) {
  await ready()
  const salt = fromB64(saltB64)
  const seed = sodium.crypto_pwhash(
    sodium.crypto_box_SEEDBYTES, // 32-byte seed for the X25519 keypair
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
  const kp = sodium.crypto_box_seed_keypair(seed)
  // Wipe the seed from memory; keypair is what we keep for the session.
  sodium.memzero(seed)
  return {
    publicKey: kp.publicKey, // Uint8Array (32)
    privateKey: kp.privateKey, // Uint8Array (32) — session memory only
    publicKeyB64: toB64(kp.publicKey),
  }
}

// ---------- Access Key (AK): per-patient symmetric key ----------

// 32 random bytes. Wraps every DEK for one patient. Rotated on hard-revoke.
export function generateAK() {
  return sodium.randombytes_buf(32) // Uint8Array (32)
}

// ---------- AK <-> viewer, via X25519 sealed box ----------

// Seal the AK so ONLY the holder of viewerPub's private key can open it.
// crypto_box_seal needs only the recipient's public key (anonymous sender).
export function sealAKForViewer(akBytes, viewerPubB64) {
  const sealed = sodium.crypto_box_seal(akBytes, fromB64(viewerPubB64))
  return toB64(sealed)
}

// Open a sealed AK envelope with the viewer's own keypair.
export function openAKEnvelope(sealedB64, viewerPubB64, viewerPrivBytes) {
  const opened = sodium.crypto_box_seal_open(fromB64(sealedB64), fromB64(viewerPubB64), viewerPrivBytes)
  if (!opened) throw new Error("AK envelope could not be opened (wrong key or tampered)")
  return opened // Uint8Array (32) — the AK
}

// ---------- DEK <-> AK, via AES-256-GCM (Web Crypto) ----------
// Every symmetric op in this system is AES-256-GCM; here the "message" is a 32-byte DEK.

async function importAKAsAesKey(akBytes) {
  return crypto.subtle.importKey("raw", akBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

// Wrap a DEK under the AK. Returns { wrappedDek, nonce } (both base64).
export async function wrapDEK(dekBytes, akBytes) {
  const key = await importAKAsAesKey(akBytes)
  const nonce = crypto.getRandomValues(new Uint8Array(12)) // fresh 96-bit IV per wrap
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, dekBytes))
  return { wrappedDek: toB64(ct), nonce: toB64(nonce) }
}

// Unwrap a DEK under the AK. Returns the raw DEK bytes (Uint8Array).
export async function unwrapDEK(wrappedDekB64, nonceB64, akBytes) {
  const key = await importAKAsAesKey(akBytes)
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(nonceB64) }, key, fromB64(wrappedDekB64))
  return new Uint8Array(pt) // Uint8Array (32) — the DEK
}
