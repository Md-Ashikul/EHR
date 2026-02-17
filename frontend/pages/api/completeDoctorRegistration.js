import { ethers } from 'ethers';
import bcrypt from 'bcryptjs';
import { readDoctorDB, writeDoctorDB } from '../../lib/db-handler';
import { 
  contractAddress, 
  contractABI, 
  providerUrl, 
  adminPrivateKey 
} from '../../lib/constants';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, password, walletAddress } = req.body;
  const doctorDatabase = readDoctorDB();

  // FIX: Declare variables OUTSIDE the try block so 'catch' can see them
  let id;
  let doctor;

  try {
    id = parseInt(doctorId, 10);
    doctor = doctorDatabase[id];

    // 1. Validation
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }
    if (doctor.passwordHash !== null) {
      return res.status(400).json({ error: 'Doctor already registered.' });
    }

    // 2. Hash the Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Update Mock Database (Save Password)
    doctorDatabase[id].passwordHash = hashedPassword;
    writeDoctorDB(doctorDatabase);
    console.log(`Password set for Dr. ${doctor.name}`);

    // 4. Blockchain Registration
    const provider = new ethers.JsonRpcProvider(providerUrl);

    // --- Transaction 1: Register Data ---
    console.log("Registering on Blockchain (Step 1)...");
    const wallet1 = new ethers.Wallet(adminPrivateKey, provider);
    const contract1 = new ethers.Contract(contractAddress, contractABI, wallet1);
    const tx1 = await contract1.registerDoctorData(id, doctor.name);
    await tx1.wait();
    console.log("Doctor pre-check data registered on-chain.");

    // --- Transaction 2: Register Doctor ---
    console.log("Registering on Blockchain (Step 2)...");
    // Use a new wallet instance to ensure fresh nonce
    const wallet2 = new ethers.Wallet(adminPrivateKey, provider);
    const contract2 = new ethers.Contract(contractAddress, contractABI, wallet2);
    const tx2 = await contract2.registerDoctor(doctor.name, id, walletAddress);
    await tx2.wait();
    console.log("Doctor registered on-chain. Hash:", tx2.hash);

    res.status(200).json({ 
      success: true, 
      message: 'Registration complete! You can now login.',
      txHash: tx2.hash
    });

  } catch (error) {
    console.error('Error in completeDoctorRegistration:', error);
    
    // CRITICAL FIX: If blockchain fails, undo the password save!
    // Now this works because 'id' and 'doctor' are defined outside the try block.
    if (id && doctor && doctorDatabase[id]) {
        doctorDatabase[id].passwordHash = null;
        writeDoctorDB(doctorDatabase);
        console.log(`Reverted password save for Dr. ${doctor.name} due to error.`);
    }
    
    res.status(500).json({ error: 'Registration failed.', details: error.message });
  }
}