# Defense Q&A — Part 7: Rapid-Fire Definitions + Master Index

> Short, crisp answers examiners use to test whether you truly understand the basics. Answer these in one or two sentences, fast and confident.

---

## Rapid-Fire Definitions (Q131–Q150)

### Q131. Define hashing.
A one-way function that turns any input into a fixed-length string; the same input always gives the same hash, and you can't reverse the hash back into the input.

### Q132. Define immutability in blockchain.
Once data is confirmed in a block, it cannot be changed without invalidating all following blocks and being rejected by the network — so records are effectively permanent.

### Q133. Define a smart contract.
Self-executing code deployed on the blockchain that automatically enforces rules when conditions are met, without an intermediary.

### Q134. Define gas.
The unit measuring computational work for an Ethereum transaction, paid in ETH; more complex operations cost more gas.

### Q135. Define Gwei.
A denomination of ETH used to price gas; 1 Gwei is one-billionth of an ETH.

### Q136. Define consensus mechanism.
The process by which distributed nodes agree on the single valid state of the ledger — for example Proof of Work or Proof of Stake.

### Q137. Define IPFS in one line.
A peer-to-peer, content-addressed file system where files are retrieved by the hash of their content rather than by location.

### Q138. Define CID.
Content Identifier — the cryptographic hash that uniquely names a file's content on IPFS.

### Q139. Define a face descriptor.
A 128-dimensional numeric vector representing a face, where same-person faces are close together and different faces are far apart.

### Q140. Define Euclidean distance.
The straight-line distance between two points (here, two 128-D face vectors); smaller means more similar.

### Q141. Define liveness detection.
A check confirming the biometric sample comes from a live person, not a photo, video, or mask.

### Q142. Define FAR and FRR.
False Acceptance Rate is how often an impostor is wrongly accepted; False Rejection Rate is how often a genuine user is wrongly rejected.

### Q143. Define RBAC.
Role-Based Access Control — granting permissions based on a user's role; in my system, refined so patients themselves grant per-doctor access.

### Q144. Define public vs private key.
A key pair where the private key (kept secret) signs/authorizes and the public key (shareable) verifies; only the private-key holder can produce valid signatures.

### Q145. What does SSD MobileNet do in your system?
It is the lightweight neural network that detects the face in an image quickly on commodity hardware.

### Q146. What does FaceLandmark68Net do?
It locates 68 key facial points to align the face before encoding, improving recognition accuracy.

### Q147. What does FaceRecognitionNet do?
It converts the aligned face into the 128-dimensional descriptor used for matching.

### Q148. What is the difference between on-chain and off-chain?
On-chain data lives in the blockchain ledger (permanent, costly, tamper-evident); off-chain data lives elsewhere (IPFS here) with only a reference stored on-chain.

### Q149. What is a consortium blockchain?
A permissioned blockchain run by a known group of organizations rather than open to everyone — ideal for regulated sectors like healthcare.

### Q150. What is the "break-glass" access concept?
A governed emergency-access mechanism allowing urgent record access without prior consent, but only with strict logging, justification, and after-the-fact audit.

---

## MASTER INDEX — All 150 Questions by File

**01 — Blockchain & Smart Contracts (Q1–Q20)**
Fundamentals, why blockchain/Ethereum, contract walkthrough, gas costs, on/off-chain, access enforcement, Solidity safety, audit, reentrancy, key loss, deletion vs immutability, upgradeability, whitelist centralization, RBAC vs traditional.

**02 — AI Facial Biometrics (Q21–Q45)**
Pipeline, descriptors, Euclidean distance, 0.6 threshold, separation margin, liveness, model choice, FAR/FRR, sample size, evaluation method, client vs server, latency cause and fix, appearance change, twins, demographic bias, reference photo privacy, descriptor reversibility, AI–blockchain linkage, models used, detection confidence, camera quality.

**03 — Architecture, IPFS & Security (Q46–Q65)**
Hybrid Web2–Web3, why not pure dApp, server single-point concern, IPFS/CID, pinning, encryption gap, breach defense, attack scenarios, what it doesn't protect, detectable tampering, patient-only grant, mock BMDC, HTTPS, threat model, vs encrypted DB, GDPR/erasure, audit logging.

**04 — Development, Methodology & Results (Q66–Q85)**
Tech stack, Hardhat choice, registration/login flows, measurement method, defending Tables III–X, sample size, build process, hardest challenge, novelty without AI, comparison to Wu/Kumari/Hao, key finding.

**05 — Feasibility, Scalability & Bangladesh (Q86–Q105)**
Deployability, rural internet, devices, wallet usability, national scale, transaction cost, who pays, BMDC integration, legacy hospital systems, government appetite, data-protection law, cost-benefit, doctor adoption, false rejection recourse, emergency access, other countries, maintenance, onboarding millions, blockchain-overkill challenge, minimum viable deployment.

**06 — Limitations, Positioning & General Viva (Q106–Q130)**
All limitations, biggest worry, 3-month priorities, latency usability, why show unoptimized, biggest novelty, integration-as-research, literature gap, patient control rationale, audit sufficiency, assumptions, corrupt registry boundary, blockchain-hype rebuttal, ethics, ethical approval, concurrency, authn vs authz, post-access leakage, no head-to-head comparison, path to publication, 30-second summary, one improvement, self-assessment, what you learned, why it should pass.

**07 — Rapid-Fire Definitions (Q131–Q150)**
Hashing, immutability, smart contract, gas, Gwei, consensus, IPFS, CID, descriptor, Euclidean distance, liveness, FAR/FRR, RBAC, key pairs, the three face models, on/off-chain, consortium chain, break-glass.

---

## NUMBERS TO MEMORIZE COLD
- Matching avg Euclidean distance: **0.477**
- Non-matching avg distance: **0.784**
- Decision threshold: **0.6**
- Cluster separation margin: **0.308**
- Detection confidence: **~99.7%** reference, **~97%** live
- Patient registration gas: **95,752**
- Doctor registration gas: **141,433**
- Deployment latency: **110.84 ms**
- Document upload end-to-end: **~326 ms**
- AI latency (unoptimized): **53–210 seconds** (cause: per-request model reload + CPU-only inference)
- Biometric test cases: **8** (4 matching + 4 non-matching), **0 errors**
- Healthcare breaches H1 2026: **283 breaches, 20.5M people** (HHS OCR)
- Fake doctors: **7 arrested** by ACC Bangladesh (fake Chinese MBBS)

## THREE GOLDEN RULES FOR THE DEFENSE
1. **Own your limitations** — state them before the board has to dig. It signals maturity.
2. **Separate "prototype state" from "method validity"** — the slow latency is a config issue, not a flaw in the approach. Repeat this framing whenever pressed.
3. **Always tie back to the real problem** — fake doctors and data breaches. Every technical choice exists to solve that.
