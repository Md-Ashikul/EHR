import { readDoctorDB } from '../../lib/db-handler';
import { createSession, STEP_TIMEOUT_MS, SESSION_TTL_MS } from '../../lib/liveness-session';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { doctorId, doctorName } = req.body || {};
    const id = parseInt(doctorId, 10);
    const doctor = Number.isInteger(id) ? readDoctorDB()[id] : null;

    if (!doctor || doctor.name !== doctorName) {
      return res.status(404).json({ error: 'Doctor ID and Name do not match our records.' });
    }
    if (doctor.passwordHash !== null) {
      return res.status(400).json({ error: 'This doctor has already completed registration.' });
    }

    const { session, error } = createSession(id);
    if (error) return res.status(429).json({ error });

    console.log(`[LIVENESS] New session for doctor ${id} | Order=[${session.challenges.join(' -> ')}]`);
    return res.status(200).json({
      sessionId: session.id,
      challenges: session.challenges,
      stepTimeoutMs: STEP_TIMEOUT_MS,
      sessionTtlMs: SESSION_TTL_MS,
    });
  } catch (e) {
    console.error('[startLiveness]', e);
    return res.status(500).json({ error: e.message });
  }
}
