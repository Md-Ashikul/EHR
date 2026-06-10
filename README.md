# EHR - Electronic Health Records

A decentralized Electronic Health Records (EHR) system that leverages blockchain technology and IPFS to provide patients with secure, transparent, and patient-controlled access to their medical records.

## 🎯 Overview

EHR is a blockchain-based healthcare application that enables:

- **Secure Medical Records Management**: Store patient health records on IPFS with blockchain verification
- **Patient-Controlled Access**: Patients grant and revoke access to their records to authorized doctors
- **Face Recognition Verification**: Biometric authentication for enhanced security
- **Doctor Registration & Verification**: Pre-verified doctor onboarding process
- **Document Management**: Upload, view, and manage medical documents with disease tracking
- **Admin Dashboard**: Administrative control for doctor pre-registration and system management

## 🏗️ Architecture

The project is structured as a monorepo with two main components:

### Root Directory
- **Smart Contracts** (`/contracts`): Solidity contracts deployed on Hardhat local network
- **Scripts** (`/scripts`): Utility scripts for contract deployment
- **Hardhat Configuration**: Local blockchain setup and deployment configuration

### Frontend (`/frontend`)
- **Next.js Application**: Modern React frontend using Next.js with Pages Router
- **Pages**: User-facing pages for patients, doctors, and admin
- **API Routes**: Backend API handlers for blockchain and IPFS interactions
- **Utilities**: Helper functions for database and contract interactions

## 🚀 Tech Stack

### Backend & Blockchain
- **Hardhat**: Local Ethereum development environment
- **Solidity**: Smart contract language (v0.8.0)
- **Ethers.js**: Ethereum Web3 library for contract interaction
- **IPFS**: Distributed file storage for medical documents via ipfs-http-client

### Frontend
- **Next.js**: 15.1.7 React framework with Pages Router
- **React**: 19.0.0 UI library
- **Tailwind CSS**: Utility-first CSS framework
- **Face-API.js**: Face detection and recognition
- **React Webcam**: Webcam access for biometric verification
- **bcryptjs**: Password hashing for authentication

## 📁 Project Structure

```
ehr/
├── contracts/
│   └── DoctorPatient.sol          # Main smart contract
├── frontend/
│   ├── pages/
│   │   ├── _app.js                # Next.js app wrapper
│   │   ├── index.js               # Home page
│   │   ├── admin.js               # Admin dashboard
│   │   ├── doctorDashboard.js     # Doctor interface
│   │   ├── giveAccess.js          # Patient access control
│   │   ├── getDocument.js         # Document viewer
│   │   ├── registerPatient.js     # Patient registration
│   │   └── api/                   # API routes for blockchain & IPFS
│   ├── lib/
│   │   ├── constants.js           # Configuration constants
│   │   └── db-handler.js          # Database utilities
│   ├── styles/                    # CSS files
│   ├── public/                    # Static assets
│   ├── package.json
│   ├── tailwind.config.mjs
│   └── next.config.mjs
├── scripts/                       # Deployment scripts
├── hardhat.config.js              # Hardhat configuration
└── package.json
```

## 🔑 Key Features

### Smart Contract Features
- **Doctor Registration**: Pre-verified doctor registration with validation
- **Patient Registration**: Patient onboarding with wallet integration
- **Document Management**: Upload, retrieve, and delete medical documents
- **Access Control**: Fine-grained doctor access management
- **Event Logging**: Comprehensive event tracking for all operations

### Frontend Features
- **Patient Dashboard**: View assigned doctors and manage access
- **Doctor Dashboard**: Access assigned patients and their documents
- **Admin Panel**: Doctor pre-registration and system management
- **Face Verification**: Biometric authentication for enhanced security
- **Document Upload**: Upload medical records to IPFS with blockchain verification
- **Access Management**: Grant/revoke doctor access to patient records

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- MetaMask or similar Web3 wallet

### Clone & Install

```bash
# Clone the repository
git clone https://github.com/Md-Ashikul/EHR.git
cd EHR

# Install root dependencies (for Hardhat)
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Environment Setup

Create a `.env.local` file in the `frontend` directory with necessary configurations:

```env
# Example configuration
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=1337
```

## 🚀 Getting Started

### 1. Start the Local Blockchain

```bash
# Start Hardhat node
npx hardhat node
```

This starts a local Ethereum network at `http://127.0.0.1:8545`

### 2. Deploy Smart Contracts

In a new terminal:

```bash
# Deploy contracts to local network
npx hardhat run scripts/deploy.js --network localhost
```

### 3. Start the Frontend

```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The frontend will be available at `http://localhost:3000`

## 🔗 Smart Contract Overview

### DoctorPatient.sol

The main smart contract manages the entire EHR system:

**Key Structs:**
- `Doctor`: Doctor information with wallet address
- `Patient`: Patient data with access list
- `Document`: Medical document metadata and IPFS references

**Main Functions:**
- `registerDoctor()`: Register a pre-verified doctor
- `registerPatient()`: Register a patient
- `uploadDocument()`: Upload a medical document to IPFS
- `deleteDocument()`: Remove a document (doctor only)
- `giveAccess()`: Grant doctor access to patient records
- `revokeAccess()`: Remove doctor access
- `getPatientDocuments()`: Retrieve patient's documents
- `isDoctorAuthorized()`: Check doctor authorization

## 💾 API Routes

The frontend includes several API endpoints:

- `POST /api/registerPatient` - Register new patient
- `POST /api/loginDoctor` - Doctor authentication
- `POST /api/uploadDocument` - Upload medical document
- `DELETE /api/deleteDocument` - Remove document
- `GET /api/getPatientDocuments` - Fetch patient records
- `POST /api/giveAccess` - Grant doctor access
- `POST /api/revokeAccess` - Revoke doctor access
- `GET /api/verifyFace` - Biometric verification
- `GET /api/checkDoctor` - Verify doctor credentials

## 🔒 Security Features

- **Blockchain Verification**: Smart contract ensures data integrity
- **Wallet-Based Authentication**: Users authenticate via Web3 wallets
- **Patient-Controlled Access**: Patients maintain full control over who sees their records
- **IPFS Storage**: Decentralized document storage
- **Face Recognition**: Biometric authentication for enhanced security
- **Pre-Verified Doctors**: Doctor verification before network access

## 📝 License

ISC

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please create an issue in the GitHub repository.

---
