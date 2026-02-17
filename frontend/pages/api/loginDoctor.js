import bcrypt from 'bcryptjs';
import { readDoctorDB } from '../../lib/db-handler';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, password } = req.body;
  const doctorDatabase = readDoctorDB();

  try {
    const id = parseInt(doctorId, 10);
    const doctor = doctorDatabase[id];

    // 1. Check if doctor exists
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor ID not found.' });
    }

    // 2. Check if doctor has registered (set a password)
    if (doctor.passwordHash === null) {
      return res.status(400).json({ error: 'This doctor has not registered yet. Please register first.' });
    }

    // 3. Verify Password
    const isMatch = await bcrypt.compare(password, doctor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // 4. Success
    res.status(200).json({ 
      message: 'Login successful',
      doctorName: doctor.name,
      doctorId: id
    });

  } catch (error) {
    console.error('Error in loginDoctor:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
}