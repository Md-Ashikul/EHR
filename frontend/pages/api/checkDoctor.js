import { readDoctorDB } from '../../lib/db-handler';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, doctorName } = req.body;
  const doctorDatabase = readDoctorDB();

  try {
    const id = parseInt(doctorId, 10);

    // 1. Check if doctor exists in our database
    if (!doctorDatabase[id]) {
      return res.status(404).json({ error: 'Doctor ID not found in our records.' });
    }

    // 2. Check if the name matches
    if (doctorDatabase[id].name !== doctorName) {
      return res.status(400).json({ error: 'Doctor ID and Name do not match.' });
    }

    // 3. Check if doctor is *already* registered (i.e., password is set)
    if (doctorDatabase[id].passwordHash !== null) {
      return res.status(400).json({ error: 'This doctor has already completed registration.' });
    }

    // If all checks pass, return the reference photo for verification
    res.status(200).json({
      message: 'Doctor validated. Proceed to face verification.',
      referencePhotoUrl: doctorDatabase[id].referencePhotoUrl,
    });

  } catch (error) {
    console.error('Error in checkDoctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}