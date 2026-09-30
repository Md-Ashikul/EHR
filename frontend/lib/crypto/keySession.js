// keySession.js — browser-only session for the user's decrypted key material.
//
// unlockIdentity() runs Step 5 of the encryption flow:
//   1. Look up the user's public key + salt in the vault.
//   2. First use: generate a salt, derive the X25519 keypair, publish { publicKey, salt }.
//      Later uses: re-derive with the stored salt and check it matches the stored public
//      key (this is how a wrong passphrase is detected).
//   3. Patients only: on first login create the AK and seal it to their own public key;
//      on later logins fetch that envelope and open it.
//
// The private key and AK live only in React state (KeySessionProvider). They are never
// written to localStorage, cookies, or sent to the server. A full page reload drops them,
// and the user has to log in again.

import { createContext, useCallback, useContext, useMemo, useState } from "react"

export function patientIdentity(patientId) {
  return `patient:${parseInt(patientId, 10)}`
}

export function doctorIdentity(doctorId) {
  return `doctor:${parseInt(doctorId, 10)}`
}

async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function fetchPublicKey(identity) {
  const res = await fetch(`/api/keyvault/publicKey?identity=${encodeURIComponent(identity)}`)
  if (res.status === 404) return null
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || "Failed to load public key")
  return data // { identity, x25519Pub, salt }
}

async function publishPublicKey(identity, publicKey, salt) {
  const res = await fetch("/api/keyvault/publicKey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, publicKey, salt }),
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || "Failed to publish public key")
}

async function fetchOwnAkEnvelope(patientId) {
  const res = await fetch(`/api/keyvault/getEnvelope?patientId=${encodeURIComponent(patientId)}&role=patient`)
  if (res.status === 404) return null
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || "Failed to load access key envelope")
  return data.akEnvelope // { sealed, akVersion }
}

async function storeAkEnvelope(patientId, identity, sealed, akVersion) {
  const res = await fetch("/api/keyvault/putEnvelope", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ak", patientId, identity, sealed, akVersion }),
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || "Failed to store access key envelope")
}

function wipe(bytes) {
  if (bytes instanceof Uint8Array) bytes.fill(0)
}

function wipeSession(session) {
  if (!session) return
  wipe(session.privateKey)
  wipe(session.ak)
}

// role: "patient" | "doctor". id: patientId or doctorId.
export async function unlockIdentity({ role, id, passphrase }) {
  if (typeof window === "undefined") throw new Error("unlockIdentity must run in the browser")
  if (role !== "patient" && role !== "doctor") throw new Error(`Unknown role: ${role}`)
  if (!passphrase) throw new Error("Encryption passphrase is required")
  const numericId = parseInt(id, 10)
  if (Number.isNaN(numericId)) throw new Error("Invalid id")

  const km = await import("./keyManagement")
  await km.ready()

  const identity = role === "patient" ? patientIdentity(numericId) : doctorIdentity(numericId)
  const record = await fetchPublicKey(identity)

  let keypair
  let isFirstUse = false
  if (!record) {
    isFirstUse = true
    const salt = km.generateSalt()
    keypair = await km.deriveKeypairFromPassphrase(passphrase, salt)
    await publishPublicKey(identity, keypair.publicKeyB64, salt)
  } else {
    keypair = await km.deriveKeypairFromPassphrase(passphrase, record.salt)
    if (keypair.publicKeyB64 !== record.x25519Pub) {
      wipe(keypair.privateKey)
      throw new Error("Incorrect encryption passphrase")
    }
  }

  let ak = null
  let akVersion = null
  if (role === "patient") {
    const envelope = await fetchOwnAkEnvelope(numericId)
    if (!envelope) {
      ak = km.generateAK()
      akVersion = 1
      const sealed = km.sealAKForViewer(ak, keypair.publicKeyB64)
      await storeAkEnvelope(numericId, identity, sealed, akVersion)
    } else {
      try {
        ak = km.openAKEnvelope(envelope.sealed, keypair.publicKeyB64, keypair.privateKey)
      } catch (err) {
        wipe(keypair.privateKey)
        throw err
      }
      akVersion = envelope.akVersion ?? 1
    }
  }

  return {
    role,
    id: String(numericId),
    identity,
    publicKeyB64: keypair.publicKeyB64,
    privateKey: keypair.privateKey, // Uint8Array — memory only
    ak, // Uint8Array | null — patients only; doctors fetch per-patient AKs when viewing
    akVersion,
    isFirstUse,
  }
}

const KeySessionContext = createContext(null)

export function KeySessionProvider({ children }) {
  const [session, setSession] = useState(null)

  const unlock = useCallback(async (args) => {
    const next = await unlockIdentity(args)
    setSession((prev) => {
      wipeSession(prev)
      return next
    })
    return next
  }, [])

  const lock = useCallback(() => {
    setSession((prev) => {
      wipeSession(prev)
      return null
    })
  }, [])

  const value = useMemo(() => ({ session, unlock, lock }), [session, unlock, lock])
  return <KeySessionContext.Provider value={value}>{children}</KeySessionContext.Provider>
}

export function useKeySession() {
  const ctx = useContext(KeySessionContext)
  if (!ctx) throw new Error("useKeySession must be used inside KeySessionProvider")
  return ctx
}
