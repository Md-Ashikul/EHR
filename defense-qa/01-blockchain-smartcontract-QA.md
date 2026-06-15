# Defense Q&A — Part 1: Blockchain & Smart Contracts

> Section covers blockchain fundamentals and your Solidity smart contract (`DoctorPatient.sol`). Answers are written in spoken-defense style so you can adapt them aloud.

---

### Q1. What is a blockchain, in one sentence?
A blockchain is a distributed, append-only ledger where data is grouped into cryptographically linked blocks, so that once a record is confirmed it cannot be altered without invalidating every block after it and being rejected by the rest of the network.

### Q2. Why did you choose blockchain instead of a normal secure database?
A normal database, no matter how well secured, is a single point of control and a single point of failure — an administrator or attacker with access can silently alter or delete records. Blockchain gives me three properties a database cannot guarantee on its own: tamper-evidence (any change is detectable), a permanent audit trail of who accessed what, and decentralized trust so no single party owns the access-control decisions. For medical records, where integrity and accountability are critical, those properties are the whole point.

### Q3. Why Ethereum specifically?
Ethereum is the most mature smart-contract platform, has the largest developer tooling ecosystem (Solidity, Hardhat, ethers.js, MetaMask), and supports Turing-complete programmable access control. Because my contribution is the access-control and identity logic — not a new consensus algorithm — building on a proven platform let me focus on the healthcare problem rather than reinventing the chain.

### Q4. Public, private, or consortium blockchain — which is yours and which is ideal?
My prototype runs on a local Ethereum (Hardhat) test network, which behaves like a public Ethereum chain. For real healthcare deployment, a **consortium** model is ideal — hospitals, the regulator (BMDC), and authorized bodies run the validating nodes. That keeps the tamper-resistance and shared trust while controlling who can validate, which suits the privacy and governance needs of medical data.

### Q5. Walk us through your smart contract. What does it actually store and do?
The contract `DoctorPatient.sol` does four things. It **registers patients** (creating their on-chain identity). It **manages a doctor whitelist** — only admin-approved, biometrically verified doctors are added. It **enforces access control** through a patient-to-doctor permission mapping, with grant and revoke functions callable by the patient. And it **manages document references** — it appends IPFS CIDs plus metadata to a patient's record, but only after checking the calling doctor is authorized.

### Q6. What is stored on-chain versus off-chain, and why?
On-chain: identities, the doctor whitelist, the access-control mapping, and document references (IPFS CIDs plus metadata). Off-chain on IPFS: the actual medical files themselves. The reason is cost and scalability — storing a multi-megabyte medical document directly on-chain would be enormously expensive and slow, while storing just its content identifier (a short hash) is cheap and still gives tamper-evidence, because if the file changes, its CID changes.

### Q7. What is gas and why does it matter?
Gas is the unit that measures the computational work of a transaction on Ethereum; you pay for it in ETH. It matters because every write operation — registering a patient, granting access, uploading a document reference — has a real cost. Part of my evaluation was measuring that cost to prove the system is economically feasible. Read operations, by contrast, cost zero gas because they don't change state.

### Q8. What were your measured gas costs?
Patient registration was about 95,752 gas. Doctor registration, the heaviest operation because it binds identity and credential data, was 141,433 gas. Grant access, revoke access, upload document, and delete document each ranged from roughly tens of thousands up to about 300,000 gas for document upload, all costing under about 1.5 US dollars at 1 Gwei gas price and ETH at 3,000 dollars.

### Q9. Your costs seem low. Are they realistic for mainnet?
I was transparent that these are local testnet measurements at an assumed 1 Gwei gas price. On Ethereum mainnet at busy times, gas prices are far higher, so real costs would rise. That is exactly why my future work proposes deployment on a Layer-2 network like Polygon or Arbitrum, where transaction costs are a tiny fraction of mainnet while inheriting Ethereum's security.

### Q10. How does your access control actually prevent an unauthorized doctor from reading data?
Authorization is enforced inside the smart contract, not in the frontend. When a document operation is attempted, the contract checks the patient-to-doctor access mapping; if the doctor is not in that mapping, the transaction reverts with "doctor is not authorized." Because this check is on-chain, it cannot be bypassed by tampering with the web interface or calling the API directly — the chain itself refuses the operation.

### Q11. What Solidity safety mechanisms did you use?
I used `require` statements to validate conditions before state changes — for example, checking authorization before appending a document, and checking that a doctor exists before operating on them. I used mappings for O(1) lookups of patients, doctors, and permissions, and access modifiers to restrict who can call sensitive functions (for example, only the admin can whitelist doctors, and only a patient can grant or revoke access to their own records).

### Q12. Did you run a security audit on the contract?
Yes. I audited the contract using Mythril and Slither, which are standard automated smart-contract security tools. The audit reported no critical vulnerabilities — no reentrancy, no integer overflow issues (Solidity 0.8+ has built-in overflow checks), and no access-control flaws in the audited functions. Those results are summarized in Table IX of the paper.

### Q13. What is reentrancy and is your contract vulnerable?
Reentrancy is an attack where a called external contract calls back into your function before the first execution finishes, potentially draining funds or corrupting state — it caused the famous DAO hack. My contract is not vulnerable because it does not transfer Ether to external addresses in the sensitive functions and follows the checks-effects-interactions ordering; the security tools confirmed no reentrancy paths.

### Q14. Once a document reference is on-chain, can it ever be deleted? You have a delete function — isn't that a contradiction?
Good catch — this is a subtle point. Blockchain history is immutable, so the *transaction* that added a reference always remains in history. My "delete" function does not erase history; it updates the current state so the reference is no longer active or returned, and the deletion itself is recorded as a new transaction. So we get practical removal from the active record set while preserving a permanent, tamper-proof audit trail of both the addition and the removal.

### Q15. What happens if a patient loses their private key?
This is an honest limitation of any wallet-based system. If a patient loses their key, they lose the ability to sign grant/revoke transactions from that identity — similar to losing the only key to a safe. In a production consortium deployment, this would be mitigated with institutional key-recovery or custodial wallet options backed by the regulator or hospital, which is part of the operational design beyond this prototype.

### Q16. Why not store an encrypted blob directly on-chain to avoid IPFS entirely?
Because on-chain storage is priced per byte of state and is the most expensive resource in Ethereum. Storing even a single encrypted medical image on-chain could cost far more than the entire rest of the workflow combined, and it would bloat the chain for every node forever. Off-chain storage with an on-chain hash is the established, economically rational pattern.

### Q17. How is data integrity guaranteed if the file lives off-chain?
Through content addressing. IPFS names a file by the cryptographic hash of its content — the CID. That CID is stored on-chain. If anyone alters even one byte of the file, its hash changes, so it no longer matches the on-chain CID. That mismatch is immediately detectable, which means the on-chain reference acts as a tamper-proof fingerprint of the off-chain file.

### Q18. Is your smart contract upgradeable? What if you find a bug after deployment?
The current prototype contract is not upgradeable, which is a deliberate simplicity choice. For production, I would use a proxy-upgrade pattern (such as the transparent or UUPS proxy) so logic can be fixed while preserving stored state and addresses. I'd note upgradeability is itself a security trade-off, since it introduces an admin who can change logic, so it must be governed carefully — ideally by multi-signature control in the consortium.

### Q19. How do you handle the doctor whitelist — who controls it and isn't that centralization?
The admin role controls the whitelist, and yes, that is a point of partial centralization in the prototype. But it is intentional and bounded: the admin can only add doctors who have *already* passed BMDC credential validation and live biometric verification. So the admin cannot fabricate a doctor out of nothing. In production this admin role maps naturally to the regulator (BMDC) within a consortium, which is the appropriate trusted authority for licensing decisions.

### Q20. What is the difference between your on-chain logic and a traditional role-based access control system?
Traditional RBAC stores roles and permissions in a database that an administrator controls and can silently change. In my system the permission to view a patient's records is granted by the *patient themselves* through a cryptographically signed transaction, and every grant and revoke is permanently logged on-chain. So it shifts authority from the institution to the patient, and it makes every access decision auditable and non-repudiable.
