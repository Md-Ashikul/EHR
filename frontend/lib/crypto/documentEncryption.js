// documentEncryption.js — browser-only document encryption for the EHR scheme (Step 4).
//
// Converts plaintext <-> serializable ciphertext pieces. It does NOT touch IPFS or any API.
//   encryptDocument -> { ipfsPayload, dekEnvelope }
//     ipfsPayload : uploaded to IPFS (file + metadata, both AES-256-GCM under a fresh DEK)
//     dekEnvelope : stored via keyvault/putEnvelope (the DEK wrapped under the patient's AK)
//   decryptDocument -> { fileBytes, metadata }
//
// Every ciphertext is bound to `patientAddress.toLowerCase():docId` via AES-GCM AAD, so a
// payload cannot be replayed against a different patient or document without a tag failure.
//
// Browser-only: never import into pages/api/*. Plaintext and raw DEKs exist only in memory here.

import { ready, toB64, fromB64, wrapDEK, unwrapDEK } from "./keyManagement"

export const VERSION = 1
const ALG = "AES-256-GCM"
const NONCE_BYTES = 12
const DEK_BYTES = 32

// Checked at call time rather than import time so Pages Router SSR of a page that imports
// this module still renders; any actual crypto call on the server throws.
function assertBrowser() {
  if (typeof window === "undefined" || !globalThis.crypto?.subtle) {
    throw new Error("documentEncryption is browser-only and must not run on the server")
  }
}

export function generateDEK() {
  assertBrowser()
  return crypto.getRandomValues(new Uint8Array(DEK_BYTES))
}

function buildAAD(patientAddress, docId) {
  if (typeof patientAddress !== "string" || !patientAddress) throw new Error("patientAddress is required")
  if (typeof docId !== "string" || !docId) throw new Error("docId is required")
  return new TextEncoder().encode(`${patientAddress.toLowerCase()}:${docId}`)
}

function importDEK(dekBytes) {
  return crypto.subtle.importKey("raw", dekBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

async function gcmEncrypt(key, plaintext, aad) {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, key, plaintext)
  return { nonce: toB64(nonce), ciphertext: toB64(new Uint8Array(ct)) }
}

async function gcmDecrypt(key, nonceB64, ciphertextB64, aad) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(nonceB64), additionalData: aad },
    key,
    fromB64(ciphertextB64),
  )
  return new Uint8Array(pt)
}

export async function encryptDocument({ fileBytes, metadata, ak, patientAddress, docId, akVersion = 1 }) {
  assertBrowser()
  await ready()
  if (!(fileBytes instanceof Uint8Array)) throw new Error("fileBytes must be a Uint8Array")

  const aad = buildAAD(patientAddress, docId)
  const dek = generateDEK()
  try {
    const key = await importDEK(dek)
    const file = await gcmEncrypt(key, fileBytes, aad)
    const meta = await gcmEncrypt(key, new TextEncoder().encode(JSON.stringify(metadata ?? {})), aad)
    const { wrappedDek, nonce } = await wrapDEK(dek, ak)

    return {
      ipfsPayload: {
        v: VERSION,
        alg: ALG,
        fileNonce: file.nonce,
        ciphertext: file.ciphertext,
        metaNonce: meta.nonce,
        encMeta: meta.ciphertext,
        docId,
      },
      dekEnvelope: { wrappedDek, nonce, akVersion },
    }
  } finally {
    dek.fill(0)
  }
}

export async function decryptDocument({ ipfsPayload, dekEnvelope, ak, patientAddress, docId }) {
  assertBrowser()
  await ready()
  if (!ipfsPayload || ipfsPayload.v !== VERSION || ipfsPayload.alg !== ALG) {
    throw new Error("Unsupported encrypted payload version or algorithm")
  }
  if (ipfsPayload.docId !== docId) throw new Error("Payload docId does not match the requested document")
  if (!dekEnvelope?.wrappedDek || !dekEnvelope?.nonce) throw new Error("DEK envelope is missing or malformed")

  const aad = buildAAD(patientAddress, docId)
  const dek = await unwrapDEK(dekEnvelope.wrappedDek, dekEnvelope.nonce, ak)
  try {
    const key = await importDEK(dek)
    const metaBytes = await gcmDecrypt(key, ipfsPayload.metaNonce, ipfsPayload.encMeta, aad)
    const fileBytes = await gcmDecrypt(key, ipfsPayload.fileNonce, ipfsPayload.ciphertext, aad)
    return { fileBytes, metadata: JSON.parse(new TextDecoder().decode(metaBytes)) }
  } finally {
    dek.fill(0)
  }
}
