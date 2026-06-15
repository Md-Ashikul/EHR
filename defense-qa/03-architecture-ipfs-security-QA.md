# Defense Q&A — Part 3: Architecture, IPFS & Security

> Covers the hybrid Web2–Web3 design, IPFS storage, and the data-breach / security questions.

---

### Q46. What does "hybrid Web2–Web3 architecture" mean in your system?
Web2 is the familiar centralized web: my Node.js application layer, the HTTPS interface, and the user-facing dashboards. Web3 is the decentralized part: the Ethereum smart contract and IPFS storage. Hybrid means I combine them — users get a normal, easy web experience (Web2), while trust-critical operations like permissions and integrity are handled by the decentralized layer (Web3). It is the practical middle ground between usability and decentralization.

### Q47. Why not build a fully decentralized application with no server?
Because a pure dApp would force every user — including non-technical patients and busy doctors — to manage wallets, sign every action, and interact directly with the chain, which is a major usability barrier. The Node.js layer abstracts that complexity, orchestrates IPFS, and provides a clean interface. Full decentralization is theoretically purer but practically a barrier to adoption in a healthcare setting. The hybrid model trades a little decentralization for a lot of usability.

### Q48. Doesn't the Node.js server reintroduce the single point of failure you tried to avoid?
Partly, and I acknowledge it. The server is a point of centralization for *availability* — if it is down, the interface is unavailable. But it is not a point of failure for *trust or integrity*, because it cannot grant unauthorized access or alter records; those decisions are enforced on-chain and the data integrity is anchored by IPFS hashes. So a compromised or down server cannot forge access or tamper with history. Production would add server redundancy and failover, which is in my future work.

### Q49. What is IPFS and how does it work?
IPFS, the InterPlanetary File System, is a peer-to-peer protocol for storing and retrieving files in a distributed way. Instead of addressing a file by its location (a URL on one server), IPFS addresses it by its content — it hashes the file and gives you a CID, a Content Identifier. Anyone with the CID can retrieve the file from any node that has it, and the CID also proves the file hasn't changed.

### Q50. What is a CID?
A CID, Content Identifier, is the cryptographic hash of a file's content, used as its address on IPFS. Because it is derived from the content itself, it is unique to that exact content — change the file and you get a completely different CID. In my system the CID is what I store on-chain as the tamper-proof reference to each medical document.

### Q51. What happens if no node pins the file — does it disappear from IPFS?
Yes — this is an important IPFS detail. IPFS does not guarantee permanence by itself; a file remains available only while at least one node "pins" (keeps) it. In production I would use a dedicated pinning service or run institutional pinning nodes (hospitals, the regulator) to guarantee availability, or use Filecoin-backed persistence. My prototype demonstrates the storage-and-reference pattern; guaranteed persistence is an operational deployment concern.

### Q52. Are the medical files on IPFS encrypted?
In the current prototype, no — and I list this explicitly as a limitation. IPFS content is, by default, accessible to anyone who has the CID. For real deployment this is unacceptable for medical data, so my future work adds client-side encryption: the file is encrypted before upload using a key tied to the patient's wallet, so even though the ciphertext lives on IPFS, only authorized parties holding the key can decrypt it.

### Q53. So right now, is patient data actually protected on IPFS?
The *access-control logic* is protected on-chain, but the *file confidentiality* on IPFS is not yet enforced by encryption in the prototype. I am careful not to overclaim here. The architecture is designed for confidentiality, and the encryption layer is a defined, well-understood addition — but as a prototype I demonstrate the control flow and integrity, with encryption as the next implementation step. Honesty on this point is important.

### Q54. How does your system address the data-breach problem from your introduction?
In several ways. There is no single centralized database holding all records to steal — files are distributed on IPFS and references are on-chain. Access requires explicit, cryptographically signed patient consent, so a stolen doctor account cannot read records it was never granted. Every access is logged immutably, so breaches are detectable and attributable. And tampering is detectable through content hashing. This is fundamentally harder to breach than a single hospital database.

### Q55. Give a concrete attack scenario and show what your system does.
Scenario: an attacker steals a doctor's login and API access and tries to read Patient A's records. In a traditional system with a shared database, they might succeed. In mine, the document-read path calls the smart contract, which checks the patient-to-doctor access mapping. If Patient A never granted this doctor access, the contract reverts the operation. The attacker is blocked by on-chain logic that the frontend cannot override. That is the core protection.

### Q56. What does your system NOT protect against — be honest.
Three things mainly. If a patient's private key is stolen, the attacker can act as that patient — that is a key-management problem inherent to wallets. If the off-chain file lacks encryption (current prototype state), someone with a CID could read the raw file. And a denial-of-service against the Node.js server affects availability. I do not claim the system is unhackable; I claim it removes the central honeypot and makes unauthorized access and tampering detectable and access-controlled.

### Q57. Why is "detectable" tampering valuable if you can't prevent all tampering?
Because in healthcare, silent, undetectable alteration of records is the catastrophic case — a changed dosage or altered diagnosis that no one notices. With content hashing on-chain, any alteration of a file breaks its CID match and is immediately detectable, and every change is attributable to a logged transaction. Converting a silent risk into a detectable, attributable event is a major security improvement, even where prevention isn't absolute.

### Q58. How do you ensure only the patient can grant access to their own records?
The grant and revoke functions require the transaction to be signed by the patient's own wallet (private key), and the contract checks that the caller is the owner of those records. Because only the patient holds their private key, no one else can produce a valid signature to grant access on their behalf. Authority is cryptographically bound to key ownership.

### Q59. What is the role of the mock BMDC registry, and why is it "mock"?
The BMDC registry represents the regulator's database of licensed doctors and their reference photos. In my prototype it is a local JSON file standing in for the real BMDC system, because I do not have live access to the actual government database. It validates that a doctor's credential ID exists and supplies the reference photo for biometric comparison. I clearly label it as mock and identify formal BMDC integration as future work.

### Q60. Isn't relying on a mock registry a fatal weakness in your claims?
No, because the *mechanism* is what I am validating, and the mechanism is identical whether the data source is a JSON file or a live API — query the registry, confirm the credential, retrieve the reference photo, then biometrically verify. Swapping the mock for the real BMDC API is an integration task, not a redesign. I demonstrate that the credential-plus-biometric gate works; production wires it to the authoritative source.

### Q61. How does HTTPS fit into your security model?
HTTPS encrypts data in transit between the user's browser and the Node.js layer, protecting the live biometric frame, credentials, and form data from network eavesdropping. It is a necessary baseline but not sufficient on its own — it protects data moving over the wire, while blockchain protects integrity and authorization, and (in future) encryption protects data at rest. They are layers of defense addressing different threats.

### Q62. What is the threat model — who are you defending against?
Primarily: external attackers trying to read or alter records without authorization; insiders or compromised accounts trying to access records they weren't granted; and impostors trying to impersonate a licensed doctor. My layers map to these: on-chain access control stops unauthorized reads, immutable logging deters and detects insider misuse, and biometric-plus-credential verification stops impersonation. I am not defending against a patient who chooses to misuse their own key.

### Q63. How is this better than just encrypting a central database really well?
A well-encrypted central database still has a single administrator and a single point of compromise, and it relies on trusting that administrator not to alter or leak data. My design removes the central honeypot, distributes storage, makes access patient-authorized, and makes every action independently auditable on a ledger no single party controls. Encryption protects confidentiality; my design adds decentralized trust, integrity, and auditability that encryption alone does not provide.

### Q64. What about GDPR / "right to be forgotten" versus blockchain immutability?
This is a genuine tension. Immutable ledgers conflict with the legal right to erase personal data. My design mitigates it by keeping personal *data* off-chain (on IPFS, deletable by unpinning) and storing only references and permissions on-chain. So the actual personal data can be made unavailable by removing the off-chain content and keys, while the chain retains only non-identifying references and audit metadata. Full legal compliance would need careful design, which I flag as an important consideration.

### Q65. How do you log access for auditing?
Every state-changing action — registration, grant, revoke, upload, delete — is an on-chain transaction, permanently recorded with the caller's address and a timestamp via the block. That ledger *is* the audit trail: it is immutable, ordered, and independently verifiable. Unlike a database log that an admin can edit, this log cannot be quietly altered, which is exactly what regulators and auditors need.
