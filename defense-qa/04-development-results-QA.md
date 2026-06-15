# Defense Q&A — Part 4: Development, Methodology & Results Interpretation

> Covers how you built it, your tools, and how to defend every number in your results tables.

---

### Q66. What is your complete technology stack?
Smart contracts in Solidity, developed and tested with the Hardhat framework on a local Ethereum network. The application layer is Node.js, exposing HTTPS APIs. The frontend uses React/Next.js with a webcam component. AI runs through face-api.js on top of TensorFlow.js, using SSD MobileNet V1, FaceLandmark68Net, and FaceRecognitionNet. Storage is IPFS for documents. Wallet interaction uses ethers.js with MetaMask. This is summarized in Table II of the paper.

### Q67. Why Hardhat instead of testing on a real network?
Hardhat gives a fast, free, reproducible local Ethereum environment ideal for development and precise measurement — I can deploy, run transactions, and read exact gas usage instantly without spending real ETH or waiting for block times. It let me gather clean, repeatable metrics. The trade-off, which I state openly, is that it does not reflect mainnet gas prices or network congestion, so the next step is public testnet deployment.

### Q68. Walk us through the doctor registration flow as you implemented it.
Two phases. Phase one, the admin enters a doctor's BMDC ID and name; the backend checks the mock BMDC registry; if valid, it returns the reference photo and registers the doctor's base data on-chain, whitelisting them. Phase two, the doctor opens the registration page with a live webcam; the system runs face detection, the smile-based liveness check, computes descriptors for the reference and live images, and calculates Euclidean distance. On a match below 0.6, the doctor's wallet and credential are finalized on-chain. On a mismatch, registration is refused.

### Q69. Walk us through what a doctor login looks like.
After registration, routine login is by doctor ID and password — deliberately lightweight, because the heavy identity proof already happened at registration where the biometric-and-credential gate binds the verified identity to the account. This keeps day-to-day usage fast while ensuring the one-time enrolment was rigorously verified. For higher-security deployments, periodic biometric re-verification could be added.

### Q70. How did you measure latency and gas precisely?
Through instrumentation in the code and Hardhat's transaction receipts. For gas, every transaction receipt reports exact gas used, which I logged. For latency, I recorded timestamps around each operation (deployment, registration, upload, read) and computed the elapsed milliseconds, printing them as metrics. The numbers in the tables are these measured values, not estimates — for example, deployment latency was logged at 110.84 ms.

### Q71. Defend Table III — your deployment metrics.
Table III reports the one-time contract deployment: about 2.89 million gas used, 110.84 ms latency on the local network, and an estimated cost of roughly 0.005 ETH, about 15.5 US dollars at the stated assumptions. Deployment is a one-time setup cost, not a per-user cost, so it is amortized across the entire system's lifetime — which is why a one-time ~15-dollar figure is entirely acceptable.

### Q72. Defend Table IV — gas, latency, and cost per operation.
Table IV lists each core write operation. Patient registration ~95,752 gas; doctor registration 141,433 gas; grant access, revoke access, upload document, and delete document each within hundreds of milliseconds and under about 1.5 dollars at 1 Gwei and ETH 3,000. The pattern makes sense: operations that write more data (doctor registration, document upload) cost more gas. All are well within practical bounds for occasional healthcare operations.

### Q73. Defend Tables V and VI — document upload and read latency.
Table V is end-to-end document upload latency — capturing IPFS pinning plus the on-chain reference write — at roughly a few hundred milliseconds, with about 326 ms in my measurement. Table VI is read-operation latency; reads cost zero gas because they don't change state, and they returned quickly. The takeaway: the blockchain and IPFS layers are fast enough that they are not the bottleneck — the AI latency was the bottleneck, which I address separately.

### Q74. Defend Tables VII and VIII — biometric results.
Table VII is matching identities: four attempts, average Euclidean distance 0.477, reference detection confidence ~99.7 percent, live confidence ~97 percent, all four correctly verified. Table VIII is non-matching identities: four attempts, average distance 0.784, all four correctly rejected. Together they show a clean separation around the 0.6 threshold with a 0.308 cluster margin and zero errors on the test set.

### Q75. Defend Table IX — the security audit.
Table IX summarizes the Mythril and Slither automated audits of the smart contract. The result was no critical vulnerabilities detected — no reentrancy, no overflow, no access-control flaws in the audited functions. This provides evidence that the on-chain logic, which is the trust-critical core, is sound at the level these standard tools assess.

### Q76. Defend Table X — your comparison with centralized EHR.
Table X contrasts a centralized EHR system with BioChain across dimensions like single point of failure, tamper-resistance, access control authority, auditability, and identity verification. Centralized systems concentrate risk and authority; BioChain distributes storage, makes the patient the access authority, provides immutable auditing, and adds biometric identity verification. It frames qualitatively why the architecture is an improvement, complementing the quantitative tables.

### Q77. Your sample size for biometrics is 8. Why should we trust any of it?
You should trust it for exactly what it claims — a working, integrated prototype with a clean separation margin — and no more. I deliberately do not claim a validated accuracy rate. The value of the 8 cases is demonstrating that the full pipeline functions correctly and that genuine and impostor distances fall cleanly on opposite sides of the threshold. Statistical accuracy claims require the large-scale study I outline in future work.

### Q78. Did you test on more than one person's face?
The reported set uses a matching subject and non-matching subjects to produce the two clusters. I am candid that this is a controlled, small-scale demonstration on limited subjects. Broad demographic testing — many identities, varied skin tones, ages, devices, and lighting — is precisely the validation gap I name, and it is the first priority before any clinical use.

### Q79. How long did the whole system take to build, and did you build it alone?
I developed the integrated prototype as the practical core of this research — the smart contract, the Node.js orchestration layer, the AI verification pipeline, the IPFS integration, and the dashboards — and then instrumented and measured it. The emphasis throughout was on producing a *working, measurable* system rather than a paper design, which is why I can defend real numbers rather than projections.

### Q80. What was the hardest technical challenge you faced?
Integrating the AI verification cleanly with the blockchain registration flow — making the biometric result reliably gate the on-chain identity binding — and handling the server-side face-api.js execution. The latency issue emerged from that server-side AI setup, and diagnosing it to the root causes (per-request model reloading and CPU-only inference) was a key learning. It also gave me a clear, concrete optimization path.

### Q81. If you removed the AI, would the system still be novel?
Less so. Plenty of work combines blockchain and IPFS for EHRs — that part, while solid engineering, is not by itself the novelty. The distinctive contribution is integrating *AI biometric identity verification with liveness detection* and *regulatory credential validation* into the blockchain access-control flow, specifically aimed at the fake-practitioner problem. The AI gate is central to the contribution, not an add-on.

### Q82. How is your work different from Kumari et al. (HealthRec-Chain), which also uses blockchain + IPFS?
HealthRec-Chain focuses on patient-centric privacy-preserving storage using Ethereum and IPFS — strong on storage, but it has no biometric authentication and no regulatory credential verification of practitioners. My system shares the blockchain-plus-IPFS storage foundation but adds the two-stage identity gate: BMDC credential validation plus live facial biometric matching. So I directly address practitioner identity fraud, which their work does not.

### Q83. How is your work different from Wu et al. (consortium blockchain EHR)?
Wu et al. enable institution-to-institution EHR sharing on a consortium chain, but trust is institutional — they assume the participating institution vouches for its users, with no individual biometric verification. My system verifies the individual practitioner directly and gives access authority to the patient rather than the institution. Different trust model and a different problem focus.

### Q84. How is your work different from Hao et al. (lightweight SSD facial recognition)?
Hao et al. demonstrate that a lightweight CNN-plus-SSD model achieves accurate facial recognition without heavy hardware — I build on that rationale for choosing a lightweight model. But their system is standalone facial recognition with no connection to healthcare access control or blockchain. My contribution is embedding that lightweight-model approach into a blockchain-secured EHR workflow as the identity gate.

### Q85. What is your single most important finding?
That a BMDC-aligned hybrid blockchain EHR with AI biometric verification is genuinely feasible and measurable: core blockchain operations complete in hundreds of milliseconds at sub-dollar-and-a-half cost, and the biometric gate cleanly separates genuine from impostor faces with a 0.308 margin around the threshold — while the one real bottleneck, AI latency, has a clearly identified and solvable cause.
