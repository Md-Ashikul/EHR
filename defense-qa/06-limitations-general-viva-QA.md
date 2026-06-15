# Defense Q&A — Part 6: Limitations, Research Positioning & General Viva

> Covers honest limitation defense, contribution framing, and the broad "viva" questions examiners use to test understanding and maturity.

---

### Q106. State your limitations honestly — all of them.
Six. One: the biometric evaluation used only 8 test cases on limited subjects in controlled conditions. Two: AI inference latency was 53 to 210 seconds due to CPU-only inference and per-request model reloading. Three: it runs on a local Hardhat testnet, not a public chain. Four: BMDC verification uses a mock JSON registry, not the live database. Five: documents on IPFS are not yet client-side encrypted. Six: access control is patient-level, not document-level. I view stating these clearly as a strength, not a weakness.

### Q107. Which limitation worries you most and why?
The lack of client-side encryption on IPFS, because for real medical data, confidentiality at rest is non-negotiable, and without it the prototype demonstrates control flow but not full confidentiality. It is also the most clearly solvable — asymmetric encryption keyed to the patient's wallet is a well-understood addition. So it is both my biggest current gap and a concrete, near-term fix.

### Q108. If you had three more months, what would you do first?
First, optimize the AI — load models once at startup and switch to the native TensorFlow.js backend — to bring verification to a few seconds, because that is the most visible weakness. Second, add client-side encryption for IPFS. Third, deploy to a public testnet for realistic gas data. Those three convert the prototype from "feasible demonstration" to "credible pilot candidate."

### Q109. Isn't 53-210 seconds completely unusable in a real clinic?
In its current unoptimized form, yes, it would be impractical — I don't pretend otherwise. But the latency is an artifact of how the prototype loads models per request on a CPU, not a property of the recognition itself. Once models are kept resident in memory and run on the native backend, this drops to roughly one to a few seconds, which is perfectly usable. The slow number is a configuration state, not a verdict on the method.

### Q110. Why present unoptimized results at all? It looks bad.
Because scientific honesty requires reporting what the prototype actually did, and because diagnosing the cause is itself a contribution — it tells anyone building on this work exactly what to fix and why. Hiding the number or quietly tuning it before measuring would be misleading. I'd rather show a real bottleneck with a clear solution than a polished number with no analysis.

### Q111. What is the single biggest novelty of your thesis?
The integration: combining regulatory credential validation (BMDC) and live AI facial biometrics with liveness detection into a blockchain-based, patient-controlled EHR access system — and validating it as a working, measured prototype. Individually these pieces exist; uniting them specifically to attack practitioner-identity fraud in a developing-country EHR context, with empirical metrics, is the novel whole.

### Q112. Isn't combining existing components just engineering, not research?
Meaningful integration is research when it addresses a gap the individual components don't, and when it produces new knowledge through evaluation. My literature review shows no existing system unifies biometric identity, regulatory credentialing, and patient-controlled blockchain access for this problem. Demonstrating that this combination is feasible and measuring how it behaves — including discovering the latency cause and the clean biometric separation margin — is a genuine research contribution.

### Q113. What is the gap in the literature your work fills, in one sentence?
Existing blockchain EHR systems secure *data* but assume the practitioner's identity is already trustworthy, while existing facial-recognition systems verify *identity* but in isolation — no prior work integrates live biometric identity verification with regulatory credentialing inside a patient-controlled blockchain EHR, which is precisely the gap I fill.

### Q114. Why should the patient, not the doctor or hospital, control access?
Because it is the patient's data and the patient who bears the consequences of its misuse, yet in current systems they have the least control. Patient-centric control aligns authority with the person most affected, reduces institutional over-reach, and creates a clear consent trail. It also matches the global direction of health-data policy, which increasingly emphasizes patient consent and data sovereignty.

### Q115. How do you know your security audit (Mythril/Slither) is sufficient?
I don't claim it is exhaustive — automated tools catch known vulnerability classes (reentrancy, overflow, common access-control errors) but not every logic flaw. A clean Mythril and Slither result is strong baseline evidence that the contract avoids the well-known pitfalls, which is appropriate for a prototype. Production would add manual expert audit, formal verification of critical functions, and a bug-bounty period. I position the audit as necessary and reassuring, not as a complete guarantee.

### Q116. What assumptions does your whole system rest on?
Several, and I should name them: that the BMDC registry data is accurate and trustworthy; that the patient securely controls their private key; that participating nodes in a consortium are reasonably honest (the consensus assumption); that connectivity exists; and that the reference photo genuinely belongs to the credentialed doctor. My system's guarantees are conditional on these, which is true of any real system — being explicit about them is part of rigor.

### Q117. If the BMDC data itself is corrupt or has fake entries, your system trusts garbage.
Correct — this is the "garbage in, garbage out" boundary. My system verifies that a live person matches a credentialed reference and that the credential exists in the authoritative registry; it cannot fix corruption inside that registry. That is the regulator's responsibility. What my system does add is that even given a correct registry, it prevents impersonation of a real credential — closing the specific gap of someone using a genuine doctor's identity who isn't that doctor.

### Q118. How would you respond to a claim that blockchain is hype and unnecessary here?
I'd separate hype from the specific properties I use. I'm not using blockchain for buzz; I'm using three concrete properties — decentralized trust across multiple institutions, immutable auditability, and tamper-evidence — that a single-owner database cannot provide without a trusted central party. For a multi-stakeholder national system where no single party should hold unilateral control over medical access records, those properties are the justified reason, not hype.

### Q119. What ethical considerations does your system raise?
Biometric data is highly sensitive and permanent — you can't reissue your face — so storing and processing it demands strong protection and consent. There are bias risks across demographics. There's the surveillance concern of centralizing identity verification. And there's equity — ensuring the system doesn't exclude those without devices or connectivity. Responsible deployment must address consent, data minimization (storing descriptors not photos), bias testing, and accessible fallback paths.

### Q120. Did you obtain ethical approval or use real patient data?
No real patient medical data was used — the prototype uses test identities and the biometric evaluation used limited consenting test subjects in a controlled setting. A real clinical study with patient data would require formal ethical approval and informed consent, which is part of the clinical-validation future work, not the prototype stage.

### Q121. How does your system handle concurrent access or conflicts?
Blockchain transactions are ordered by the network into a single agreed sequence, so concurrent state changes are serialized deterministically — there is no ambiguous "who wrote last" problem; the chain establishes canonical order. For reads, multiple parties can read simultaneously at zero cost. So the ledger's consensus inherently handles concurrency for the access-control state.

### Q122. What is the difference between authentication and authorization in your system?
Authentication is proving *who you are* — handled by the biometric-plus-credential gate at registration and ID/password at login. Authorization is determining *what you're allowed to do* — handled by the on-chain patient-to-doctor access mapping checked on every sensitive operation. My system deliberately separates them: strong identity proof up front, and fine-grained, patient-controlled permission enforcement at the point of each action.

### Q123. Could a doctor, once granted access, leak the data anyway?
Yes — once an authorized doctor legitimately accesses a record, they could in principle misuse it, just as in any system. No access-control technology prevents an authorized human from misbehaving with data they're allowed to see. What my system adds is that the access was explicitly consented to and is permanently logged and attributable, which enables accountability and deterrence after the fact. The defense is auditability, not impossibility.

### Q124. Why didn't you compare your system experimentally against an existing system head-to-head?
A fair head-to-head requires a comparable reference implementation and a shared benchmark, which weren't available for these specific integrated capabilities — most prior systems don't include the biometric-plus-credential gate, so there's no apples-to-apples baseline to run. I instead positioned the work qualitatively against the literature (Table X) and quantitatively with my own measured metrics. Building a standardized benchmark for such systems is itself useful future work.

### Q125. What would make this publishable in a strong venue?
Three additions: large-scale biometric validation with ROC/EER analysis across diverse subjects; the optimized, real-time AI implementation with reported latency; and a public-testnet or Layer-2 deployment with realistic cost data, ideally plus the encryption layer. That converts a feasibility prototype into an empirically validated system with defensible accuracy, performance, and cost claims.

### Q126. Summarize your contribution in 30 seconds for a non-expert.
Fake doctors and medical-data breaches cause real harm. I built a system where, before any doctor can touch patient records, they must prove they're a real, licensed doctor using their face on a live camera checked against the medical council's records — and patients themselves control who sees their data, with every access permanently and tamper-proofly logged. I built it, ran it, and measured that it works.

### Q127. If the board approves only one improvement before deployment, which do you choose?
Client-side encryption of the medical files on IPFS. Because everything else — latency, testnet, mock registry — affects performance or realism, but the absence of encryption affects patient confidentiality directly, which is the one thing you cannot compromise on in healthcare. Get confidentiality right first; optimize the rest in parallel.

### Q128. Are you satisfied with this work? What's your honest self-assessment?
I'm satisfied that it achieves its goal: proving, with a working and measured prototype, that AI-biometric identity verification can be integrated into a patient-controlled blockchain EHR to attack a real, documented problem. I'm clear-eyed that it's a feasibility stage with defined gaps — small biometric sample, latency, mock registry, no encryption yet. The contribution is the validated architecture and the honest roadmap from here to a deployable system.

### Q129. What did you personally learn from this research?
Technically, deep practical understanding of smart-contract development and cost, of face-embedding biometrics and their thresholds, and of how off-chain and on-chain layers interact. Beyond the technical, I learned the value of honest measurement — that reporting a real bottleneck with its cause is more valuable than a polished result — and how much of real-world system viability is policy, usability, and infrastructure, not just code.

### Q130. Why should this thesis pass?
Because it identifies a real, documented problem; reviews the literature to find a genuine gap; proposes a sound integrated architecture to fill it; *implements* that architecture as a working prototype rather than a paper design; measures it honestly with real metrics; audits its security; and states its limitations and a concrete path forward with full transparency. It demonstrates both technical capability and research maturity.
