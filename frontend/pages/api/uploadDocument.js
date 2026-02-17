import { create } from 'ipfs-http-client';
import { ethers } from 'ethers';
import { contractAddress, contractABI, ipfsHost, ipfsApiPort, ipfsProtocol, providerUrl } from '../../lib/constants'; // Added providerUrl

const connectToIPFS = () => {
  return create({
    host: ipfsHost,
    port: ipfsApiPort,
    protocol: ipfsProtocol,
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId, doctorId, diseaseName, description, imageFile } = req.body;

  try {
    // 1. Upload to IPFS
    const ipfsClient = connectToIPFS();
    const imageBuffer = Buffer.from(imageFile, 'base64');
    const added = await ipfsClient.add(imageBuffer);
    const imageCID = added.path;

    // 2. Store in Smart Contract (with correct doctor)
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    // 3. Fetch the Doctor's wallet address
    const doctor = await contract.doctors(doctorId);
    const doctorWalletAddress = doctor.wallet;
    if (!doctorWalletAddress || doctor.id == 0) {
        return res.status(404).json({ error: "Doctor not found" });
    }

    // 4. Get all Hardhat accounts
    const accounts = await provider.listAccounts();
    
    // 5. Find the signer that matches the doctor's wallet
    const matchingAccount = accounts.find(
        (account) => account.address.toLowerCase() === doctorWalletAddress.toLowerCase()
    );

    if (!matchingAccount) {
        return res.status(403).json({ error: "Doctor wallet not found in local Hardhat node. Cannot impersonate." });
    }

    // 6. Get the signer
    const signer = await provider.getSigner(matchingAccount.address); 
    const contractWithSigner = new ethers.Contract(contractAddress, contractABI, signer);
    
    // 7. Call the contract *as the doctor*
    const tx = await contractWithSigner.uploadDocument(patientId, doctorId, imageCID, diseaseName, description, imageCID);
    await tx.wait();

    res.status(200).json({
      message: "Document uploaded successfully",
      txHash: tx.hash,
      imageCID: imageCID
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({ error: "Error uploading document", details: error.message });
  }
}