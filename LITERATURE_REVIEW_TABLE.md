# Literature Review Comparison Table

## Key References from Your Research

This table compares the core approaches, identified research gaps, and classification fields of recent blockchain-based healthcare systems with your BioChain implementation.

---

## Comprehensive Comparison Table

| **Author (Year) & Reference** | **Core Approach** | **Identified Research Gap** | **Classification Field** |
|---|---|---|---|
| **[1] Wu et al. (2024)** | Consortium blockchain model for EHR sharing between multiple healthcare institutions with access control via smart contracts | Lacks practitioner identity verification; relies on institutional trust rather than individual credential validation | Consortium Blockchain & Access Control |
| **[2] Tahir et al. (2024)** | Blockchain framework targeting data privacy and integrity in healthcare with encrypted record sharing between system participants | No biometric authentication for practitioners; assumes trusted participant registration | Blockchain Privacy & Integrity |
| **[3] Al-Khasawneh et al. (2024)** | Secure blockchain-based system protecting patient health information through distributed ledger technology and smart contracts | Lacks AI-driven authentication; no regulatory credential verification against medical councils | Blockchain-Based EHR Security |
| **[4] Quazi et al. (2024)** | Blockchain applications in electronic health records using distributed consensus mechanisms for immutable record storage | No discussion of fake practitioner prevention; focuses on data storage rather than access authentication | Distributed EHR Storage |
| **[5] Guo et al. (2023)** | Hybrid blockchain-edge architecture with attribute-based cryptographic mechanisms for EHR management | Limited to cryptographic access control; lacks real-time biometric liveness detection | Hybrid Blockchain-Edge Architecture |
| **[6] Lv et al. (2024)** | Cross-chain sharing of personal health records using heterogeneous and interoperable blockchains | Does not address unqualified practitioner registration; focuses on interoperability | Cross-Chain Healthcare Interoperability |
| **[7] Simonoski & Bogatinoska (2024)** | BLOCKMEDCARE: Blockchain integration with AI and IoT for healthcare | Mentions AI but lacks specific facial recognition with liveness detection for practitioner verification | Blockchain + AI + IoT Integration |
| **[8] Agbeyangi et al. (2024)** | Hyperledger Fabric implementation for electronic health records at hospital level | Enterprise-focused; lacks regulatory credential verification and biometric authentication | Enterprise Hyperledger Fabric |
| **[9] Kumari et al. (2024)** | HealthRec-Chain: Patient-centric blockchain with IPFS for privacy-preserving health data | IPFS-based storage similar to BioChain; lacks AI biometric authentication and BMDC credential verification | Blockchain + IPFS + Privacy |
| **[10] Cheng et al. (2020)** | Secure medical data sharing scheme based on blockchain with encryption mechanisms | Foundational work; limited AI capabilities; no biometric authentication layer | Blockchain Medical Data Sharing |
| **YOUR SYSTEM: BioChain** | **Two-stage authentication (BMDC credential + AI facial recognition with liveness detection) + Blockchain access control + IPFS storage + Patient-centric RBAC** | **SOLVED: Integrates real-time AI biometric authentication + regulatory credential verification + hybrid blockchain architecture + document integrity hashing** | **AI-Driven Biometric Authentication + Blockchain + IPFS + BMDC Compliance** |

---

## Key Research Gaps Addressed by BioChain

1. **Practitioner Identity Assurance** - All prior works lack facial recognition + liveness detection
2. **Regulatory Compliance** - BioChain integrates BMDC credential verification (Bangladesh-specific)
3. **Anti-Spoofing Authentication** - Real-time liveness detection with smile recognition
4. **AI-Driven Verification** - SSD MobileNet V1 + FaceRecognitionNet + Euclidean distance matching
5. **Patient-Centric Control** - Direct cryptographic authority over access permissions
6. **Document Integrity** - IPFS content hashing + blockchain access logs

---

## References

[1] Wu, G., Wang, H., Yang, Z. et al. (2024). Electronic Health Records Sharing Based on Consortium Blockchain. *Journal of Medical Systems*, 48, 106. https://doi.org/10.1007/s10916-024-02120-9

[2] Tahir, N. U. A., Rashid, U., Hadi, H. J., Ahmad, N., Cao, Y., & Alshara, M. A. (2024). Blockchain-Based Healthcare Records Management Framework: Enhancing Security, Privacy, and Interoperability. *Technologies*, 12(9), 168. https://doi.org/10.3390/technologies12090168

[3] Al-Khasawneh, M. A., et al. (2024). A Secure Blockchain Framework for Healthcare Records Management Systems. *Healthcare Technology Letters*, 11(6), 461–470. https://doi.org/10.1049/htl2.12092

[4] Quazi, F., Raju, N., Gorrepati, N., & Kareem, S. A. (2024). Blockchain Applications in Electronic Health Records (EHRs). *International Journal of Global Innovations and Solutions* (IJGIS). https://doi.org/10.21428/e90189c8.5043b7de

[5] Guo, H., Li, W., Nejad, M., & Shen, C. C. (2023). A Hybrid Blockchain-Edge Architecture for Electronic Health Record Management With Attribute-Based Cryptographic Mechanisms. *IEEE Transactions on Network and Service Management*, 20. https://doi.org/10.1109/tnsm.2022.3186006

[6] Lv, Y., Li, X., Wang, Y., Chen, K., Hou, Z., & Feng, R. (2024). Cross-chain Sharing of Personal Health Records: Heterogeneous and Interoperable Blockchains. In *2024 IEEE International Conference on Bioinformatics and Biomedicine (BIBM)* (pp. 3588-3591). https://doi.org/10.1109/bibm62325.2024.10822679

[7] Simonoski, O., & Bogatinoska, D. C. (2024). BLOCKMEDCARE: Advancing Healthcare Through Blockchain Integration with AI and IOT. *International Journal of Network Security & Its Applications* (IJNSA), 16(6), 55-75. https://doi.org/10.5121/ijnsa.2024.16604

[8] Agbeyangi, A., Oki, O., & Mgidi, A. (2024). Blockchain in Healthcare: Implementing Hyperledger Fabric for Electronic Health Records at Frere Provincial Hospital. *ArXiv*, abs/2407.15876. https://doi.org/10.48550/arxiv.2407.15876

[9] Kumari, D., Parmar, A. S., Goyal, H. S., Mishra, K., & Panda, S. (2024). HealthRec-Chain: Patient-centric blockchain enabled IPFS for privacy preserving scalable health data. *Computer Networks*, 241, 110223. https://doi.org/10.1016/j.comnet.2024.110223

[10] Cheng, X., Chen, F., Xie, D., Sun, H., & Huang, C. (2020). Design of a Secure Medical Data Sharing Scheme Based on Blockchain. *Journal of Medical Systems*, 44, 1-11. https://doi.org/10.1007/s10916-019-1468-1

