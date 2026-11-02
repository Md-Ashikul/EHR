import crypto from 'crypto';

export const ALL_CHALLENGES = ['blink', 'left', 'right', 'smile'];

// The clock starts only AFTER the client has achieved face lock and called /api/startLiveness.
// User-facing time (gestures + 500ms transitions) must fit in GESTURE_WINDOW_MS.
// Server-side verification time is measured by the server and excluded, so a slow CPU doesn't eat the user's budget.
export const GESTURE_WINDOW_MS = 10_000;
// Covers the upload of the last burst captured just before the deadline.
export const NETWORK_GRACE_MS = 1_000;
// Absolute wall-clock cap regardless of processing time.
export const SESSION_HARD_TTL_MS = 60_000;
export const MAX_FAILURES_PER_STEP = 12;
export const PROOF_TTL_MS = 60_000;
export const REGISTRATION_GRANT_TTL_MS = 5 * 60_000;
const MAX_SESSIONS_PER_DOCTOR_WINDOW = 8;
const SESSION_RATE_WINDOW_MS = 10 * 60_000;

const KNOWN_WEAK_SECRETS = new Set([
  'process.env.LIVENESS_SECRET',
  'ehr-biometric-liveness-hmac-secret-2026',
  'secret',
  'changeme',
  'liveness',
]);

// Fail closed: a missing or guessable secret would let anyone forge liveness proofs.
export function getLivenessSecret() {
  const secret = process.env.LIVENESS_SECRET;
  if (!secret || secret.length < 32 || KNOWN_WEAK_SECRETS.has(secret)) {
    throw new Error(
      'LIVENESS_SECRET is missing or too weak. Set it to a random value of at least 32 characters (e.g. `openssl rand -hex 32`).'
    );
  }
  return secret;
}

// In-memory store: the app is a single Node process (file-backed doctor DB), so sessions live here.
// globalThis keeps state across Next.js dev hot reloads.
const store =
  globalThis.__livenessStore ||
  (globalThis.__livenessStore = {
    sessions: new Map(),
    registrationGrants: new Map(),
    sessionStarts: new Map(),
  });

function prune() {
  const now = Date.now();
  for (const [id, s] of store.sessions) {
    if (now - s.createdAt > SESSION_HARD_TTL_MS + PROOF_TTL_MS) store.sessions.delete(id);
  }
  for (const [token, g] of store.registrationGrants) {
    if (now > g.expiresAt) store.registrationGrants.delete(token);
  }
}

function secureShuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hmac(data) {
  return crypto.createHmac('sha256', getLivenessSecret()).update(data).digest('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function createSession(doctorId) {
  getLivenessSecret();
  prune();
  const now = Date.now();

  const starts = (store.sessionStarts.get(doctorId) || []).filter((t) => now - t < SESSION_RATE_WINDOW_MS);
  if (starts.length >= MAX_SESSIONS_PER_DOCTOR_WINDOW) {
    const retryAfterMs = SESSION_RATE_WINDOW_MS - (now - starts[0]);
    return {
      error: `Too many liveness attempts for this doctor. Try again in ${Math.ceil(retryAfterMs / 60_000)} minute(s).`,
      retryAfterMs,
    };
  }
  starts.push(now);
  const attemptsLeft = MAX_SESSIONS_PER_DOCTOR_WINDOW - starts.length;
  store.sessionStarts.set(doctorId, starts);

  // Only one live session per doctor — starting a new one kills older ones.
  for (const [id, s] of store.sessions) {
    if (s.doctorId === doctorId && s.status === 'active') store.sessions.delete(id);
  }

  const session = {
    id: crypto.randomBytes(32).toString('hex'),
    doctorId,
    challenges: secureShuffle(ALL_CHALLENGES),
    step: 0,
    completed: [],
    createdAt: now,
    processingMs: 0,
    busy: false,
    stepFailures: 0,
    anchorDescriptor: null,
    finalFrame: null,
    seenFrameHashes: new Set(),
    status: 'active',
    passedAt: null,
  };
  store.sessions.set(session.id, session);
  return { session, attemptsLeft };
}

export function userElapsedMs(session, now = Date.now()) {
  return now - session.createdAt - session.processingMs;
}

export function getSession(sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
  prune();
  return store.sessions.get(sessionId) || null;
}

export function sessionTimeError(session) {
  const now = Date.now();
  if (now - session.createdAt > SESSION_HARD_TTL_MS) return 'Liveness session expired.';
  if (userElapsedMs(session, now) > GESTURE_WINDOW_MS + NETWORK_GRACE_MS) {
    return `Time is up — all gestures must be completed within ${GESTURE_WINDOW_MS / 1000} seconds.`;
  }
  return null;
}

export function failSession(session) {
  session.status = 'failed';
  session.finalFrame = null;
  store.sessions.delete(session.id);
}

export function issueProof(session) {
  session.status = 'passed';
  session.passedAt = Date.now();
  const sig = hmac(`${session.id}|${session.doctorId}|${session.passedAt}`);
  return `${session.id}.${sig}`;
}

// Single-use: the session is removed the moment a valid proof is presented.
export function consumeProof(proof, doctorId) {
  if (typeof proof !== 'string') return { error: 'Liveness proof missing.' };
  const [sessionId, sig] = proof.split('.');
  const session = getSession(sessionId);
  if (!session || session.status !== 'passed') return { error: 'Liveness proof is invalid or was already used.' };

  const expected = hmac(`${session.id}|${session.doctorId}|${session.passedAt}`);
  if (!safeEqualHex(sig, expected)) return { error: 'Invalid liveness proof signature.' };
  if (session.doctorId !== doctorId) return { error: 'Liveness proof belongs to a different doctor.' };

  store.sessions.delete(session.id);
  session.status = 'consumed';
  if (Date.now() - session.passedAt > PROOF_TTL_MS) return { error: 'Liveness proof expired.' };
  if (!session.finalFrame || !session.anchorDescriptor) return { error: 'Liveness session incomplete.' };

  return { session };
}

export function issueRegistrationGrant(doctorId) {
  getLivenessSecret();
  prune();
  const token = crypto.randomBytes(32).toString('hex');
  store.registrationGrants.set(token, { doctorId, expiresAt: Date.now() + REGISTRATION_GRANT_TTL_MS });
  return token;
}

// Taken out of the store immediately so two parallel requests can't both use it.
export function takeRegistrationGrant(token, doctorId) {
  prune();
  if (typeof token !== 'string') return { error: 'Face verification is required before registration.' };
  const grant = store.registrationGrants.get(token);
  if (!grant) return { error: 'Registration grant is invalid, expired, or already used. Verify your face again.' };
  store.registrationGrants.delete(token);
  if (grant.doctorId !== doctorId) return { error: 'Registration grant belongs to a different doctor.' };
  return { grant, restore: () => store.registrationGrants.set(token, grant) };
}

export function frameHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
