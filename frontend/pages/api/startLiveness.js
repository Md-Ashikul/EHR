import { readDoctorDB } from '../../lib/db-handler';
import { createSession, GESTURE_WINDOW_MS } from '../../lib/liveness-session';

// Called by the client ONLY after camera warm-up and a stable face lock — this is where the clock starts.
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

    const { session, attemptsLeft, error, retryAfterMs } = createSession(id);
    if (error) return res.status(429).json({ error, retryAfterMs });

    console.log(`[LIVENESS] New session for doctor ${id} | Order=[${session.challenges.join(' -> ')}] | attemptsLeft=${attemptsLeft}`);
    return res.status(200).json({
      sessionId: session.id,
      challenges: session.challenges,
      windowMs: GESTURE_WINDOW_MS,
      attemptsLeft,
    });
  } catch (e) {
    console.error('[startLiveness]', e);
    return res.status(500).json({ error: e.message });
  }
}
