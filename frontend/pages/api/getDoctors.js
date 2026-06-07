import { readDoctorDB } from '../../lib/db-handler';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const doctorDatabase = readDoctorDB();
        
        // Convert the dictionary { "1": {...} } into an array with IDs included
        const allDoctors = Object.keys(doctorDatabase).map(key => ({
            id: parseInt(key, 10),
            ...doctorDatabase[key]
        }));

        // Filter only doctors who have completed registration (have a wallet)
        const registeredDoctors = allDoctors.filter(
            (d) => d.wallet !== null && d.wallet !== undefined && d.wallet !== ""
        );
        
        // Format for the frontend dropdown
        const formattedDoctors = registeredDoctors.map(doc => ({
            id: doc.id,
            name: doc.name,
            wallet: doc.wallet
        }));

        res.status(200).json(formattedDoctors);
    } catch (error) {
        console.error("Error fetching doctors:", error);
        res.status(500).json({ error: "Error fetching doctors from database" });
    }
}