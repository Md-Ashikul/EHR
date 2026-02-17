import { ethers } from "ethers";
import { contractAddress, contractABI, providerUrl } from '../../lib/constants';

export default async function handler(req, res) {
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const doctorCount = await contract.doctorIdCounter();
      const doctors = [];

      for (let i = 1; i <= doctorCount; i++) {
        const doctor = await contract.doctors(i);
        doctors.push({
          id: Number(doctor[0]),
          name: doctor[1],
          wallet: doctor[2],
        });
      }
      res.status(200).json(doctors);
    } catch (error) {
      res.status(500).json({ error: "Error fetching doctors" });
    }
}