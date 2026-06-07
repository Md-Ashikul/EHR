import { readDoctorDB } from '../../lib/db-handler';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, image } = req.body;
  const doctorDatabase = readDoctorDB(); // ADDED

  try {
    console.log("--- STARTING AI BIOMETRIC METRICS ---");
    const t_start = performance.now(); // Start Timer

    // 1. Basic validation
    if (!doctorId || !image) {
      return res.status(400).json({ error: 'Missing doctor ID or image data.' });
    }

    const id = parseInt(doctorId, 10);
    const doctor = doctorDatabase[id];

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }

    // 2. Simulate AI Face Verification Logic
    console.log(`Simulating face verification for Dr. ${doctor.name}...`);
    
    // Simulate a 2-second processing delay (like a real AI service)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const t_end = performance.now(); // End Timer
    const aiLatency = (t_end - t_start).toFixed(2);
    
    console.log(`[METRIC] AI Verification Latency: ${aiLatency} ms`);
    console.log("---------------------------------------");

    // 3. Success Response
    res.status(200).json({ 
      verified: true, 
      message: 'Face verification successful.',
      metrics: {
        aiLatency // Sending latency to the frontend as well
      }
    });

  } catch (error) {
    console.error('Error in verifyFace:', error);
    res.status(500).json({ error: 'Face verification failed.' });
  }
}