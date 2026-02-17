import DoctorPatient from '../../artifacts/contracts/DoctorPatient.sol/DoctorPatient.json';

// ---------------------------------------------------------------- //
// !! IMPORTANT !!
// PASTE YOUR DEPLOYED CONTRACT ADDRESS HERE
// !! IMPORTANT !!
// ---------------------------------------------------------------- //
export const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // <-- PASTE YOUR ADDRESS

export const contractABI = DoctorPatient.abi;

// Local Hardhat node
export const providerUrl = "http://localhost:8545";

// Local IPFS node
export const ipfsHost = 'localhost';
export const ipfsApiPort = 5001; // Port for uploading
export const ipfsGatewayPort = 8080; // Port for viewing
export const ipfsProtocol = 'http';

// Hardhat's default (first account) private key, used for admin tasks like registerPatient
// In a real app, this key would be in a secure .env file.
export const adminPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";