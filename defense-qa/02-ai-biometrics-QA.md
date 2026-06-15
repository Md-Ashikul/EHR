# Defense Q&A — Part 2: AI Facial Biometrics (Core Innovation)

> This is where the hardest technical questions will come. Know the numbers cold: matching avg distance 0.477, non-matching avg 0.784, threshold 0.6, separation margin 0.308.

---

### Q21. Explain your biometric pipeline end to end.
There are four stages. First, **face detection** using SSD MobileNet V1, which locates the face in the image. Second, **liveness detection**, where the doctor must perform a live action (a smile) so we know it is a real person, not a held-up photo. Third, **descriptor computation**, where FaceLandmark68Net aligns 68 facial landmarks and FaceRecognitionNet converts the face into a 128-dimensional numeric vector called a descriptor. Fourth, **matching**, where I compute the Euclidean distance between the live descriptor and the reference-photo descriptor, and compare it to a threshold of 0.6.

### Q22. What is a face descriptor / embedding?
It is a 128-dimensional vector of floating-point numbers that numerically represents the unique geometry of a face. The model is trained so that two images of the same person produce vectors that are close together in this 128-dimensional space, while images of different people produce vectors that are far apart. Instead of comparing pixels, we compare these compact mathematical fingerprints.

### Q23. Why Euclidean distance and not something else?
Euclidean distance is the straight-line distance between the two 128-dimensional vectors. It is the standard, well-validated metric for face embeddings produced by FaceNet-style models, which is exactly what FaceRecognitionNet is based on. A smaller distance means the faces are more similar. It is simple, interpretable, and computationally cheap, which suited my real-time goal.

### Q24. Why is your threshold 0.6? Did you just pick it?
0.6 is the well-established threshold recommended for the FaceNet/face-api.js 128-D descriptor model — it is the value the model's authors and the research community validated as the best separation point between same-person and different-person pairs. My own results support it: matching faces averaged 0.477, comfortably below 0.6, and non-matching faces averaged 0.784, comfortably above it. So the threshold sits cleanly in the gap.

### Q25. What is the separation margin and why does it matter?
The separation margin is the gap between my two distance clusters and the threshold. Matching pairs at 0.477 are about 0.123 below the threshold, and non-matching pairs at 0.784 are about 0.184 above it — an overall cluster separation of roughly 0.308. A wide margin means the decision is not borderline; small natural variations in lighting or angle won't flip a correct match into a rejection. That margin is why I got zero classification errors on my test cases.

### Q26. What is liveness detection and why do you need it?
Liveness detection confirms that the face in front of the camera is a live human, not a spoof such as a printed photo, a phone screen, or a mask. Without it, someone could hold up a stolen photo of a real doctor and pass facial recognition. I implemented an active-challenge approach: the system asks the user to smile, and the expression model must detect a genuine smile from the live feed before verification proceeds. This defeats simple static-photo attacks.

### Q27. A printed photo can also be made to "smile" — isn't smile detection weak?
You are right that smile-based liveness defeats the most common attack (a static photo) but not a sophisticated one (a video replay or a deepfake). I state this honestly as a limitation. For production, I would add stronger passive liveness — texture and reflection analysis, depth sensing, or blink and head-pose challenges — which are standard in commercial anti-spoofing. My prototype demonstrates the architecture; hardening the liveness module is explicit future work.

### Q28. Why SSD MobileNet V1 and not a heavier, more accurate model?
Because of deployment context. SSD MobileNet V1 is a lightweight model designed to run on ordinary hardware without a dedicated GPU. For a system intended for clinics in a country like Bangladesh, where high-end GPUs are not guaranteed, a lightweight model that runs on commodity CPUs is the pragmatic, deployable choice. This is the same rationale as Hao et al., 2024, one of my key references.

### Q29. What is FAR and FRR, and what were yours?
FAR is the False Acceptance Rate — how often the system wrongly accepts an impostor. FRR is the False Rejection Rate — how often it wrongly rejects a genuine person. On my test set, all four matching pairs were accepted and all four non-matching pairs were rejected, so observed FAR and FRR were both zero. I am careful to say this is on a small 8-case set, so I report it as a promising indication, not a statistically validated rate.

### Q30. Eight test cases is very small. How can you claim accuracy?
I fully agree, and I state this as my first limitation. Eight cases on a single subject pair in controlled lighting is a feasibility demonstration, not a statistical validation. What it proves is that the integrated pipeline works correctly end to end and produces a clean separation margin. Establishing a true accuracy figure requires large-scale clinical testing across many subjects, skin tones, ages, lighting conditions, and devices — which is the first item in my future work.

### Q31. How would you properly evaluate accuracy in future?
I would assemble a large, diverse dataset — ideally hundreds to thousands of subjects spanning different ages, genders, skin tones, and capture conditions — and compute ROC curves, plotting FAR against FRR across a range of thresholds to find the Equal Error Rate. I would also test against spoofing datasets to quantify presentation-attack resistance. That gives defensible, publishable accuracy numbers.

### Q32. Where does the AI run — client or server — and why does it matter?
In my implementation the verification computation runs server-side via the verification API, with the live frame captured in the browser and sent for matching. Running it server-side keeps the reference descriptors and the matching logic in a controlled environment rather than exposing them in the client. The trade-off is that it adds network and server processing time, which contributed to the latency I observed.

### Q33. Your latency was 53 to 210 seconds. That's enormous. Explain.
I want to be completely transparent about this. The large latency is a prototype configuration issue, not a flaw in the approach. Two specific causes: first, each verification request reloaded all three neural-network models from disk instead of keeping them in memory; second, inference ran on CPU-based TensorFlow.js with no GPU and no native backend. So the model-loading overhead repeated on every call and accumulated. The fix is concrete and known.

### Q34. So how exactly do you fix the latency?
Three changes. One: load the models once at server startup and keep them resident in memory, so no request pays the loading cost — this alone removes the bulk of the delay. Two: switch from the pure-JavaScript backend to the TensorFlow.js native (tfjs-node) backend, which runs optimized native code. Three: optionally use GPU acceleration. Together these would bring verification down to roughly one to a few seconds, which is the normal range for this class of model.

### Q35. Why didn't you just fix the latency before the defense?
The latency problem is an engineering optimization, and my research priority was demonstrating the integrated architecture and measuring it honestly. I deliberately reported the unoptimized numbers rather than quietly tuning them, because scientific integrity matters — the board should see the real prototype behavior and the clearly identified, well-understood path to optimization.

### Q36. What if the doctor's appearance changes — beard, glasses, weight, ageing?
The 128-D embedding is fairly robust to moderate changes like glasses or a new beard, because it captures underlying facial geometry, and the 0.6 threshold has margin for natural variation. But large changes over time can increase the distance. In production I would support re-enrolment — updating the reference photo periodically — and could store multiple reference descriptors per doctor to improve robustness, which is standard practice in biometric systems.

### Q37. What about identical twins or very similar faces?
Identical twins are the known hard case for facial recognition and could in principle produce a distance below threshold. This is a recognized limitation of face biometrics generally, not specific to my system. The mitigation is defense-in-depth: facial recognition is only one of two factors. The doctor must also have a valid, admin-pre-authorized BMDC credential, so a twin without a valid registered credential still cannot enter.

### Q38. Is facial recognition biased across skin tones and demographics?
Yes — this is a well-documented concern in the field. Many face models historically underperform on darker skin tones and underrepresented groups because of biased training data. My prototype did not evaluate this, which I acknowledge. For a Bangladesh deployment it is essential, so future validation must explicitly measure performance across the local population's demographics and, if needed, fine-tune or select a model trained on representative data.

### Q39. Why store a reference photo at all? Isn't that itself a privacy risk?
The reference photo is the enrolment anchor — we need something trusted to compare the live face against, and it comes from the verified BMDC credential record. To reduce risk, the better production design is to store only the 128-D descriptor, not the raw photo, because the descriptor is a one-way numeric representation from which the original face cannot be trivially reconstructed. That minimizes the sensitive data at rest.

### Q40. Can the 128-D descriptor be reverse-engineered back into a face?
It is not designed to be reversible, and recovering a usable face image from an embedding is difficult, though research has shown approximate reconstructions are possible under some conditions. So descriptors should still be treated as sensitive data — stored securely and, ideally, encrypted. I would not claim they are perfectly anonymous; I would call them privacy-preserving relative to storing raw images.

### Q41. How does the AI step connect to the blockchain step?
The AI step is a gate that happens before any on-chain identity is finalized. A doctor's wallet is only bound to their verified identity on-chain *after* biometric matching succeeds. So the blockchain never registers a doctor whose live face failed to match their credentialed reference photo. AI provides "is this the real person," blockchain provides "is this person authorized and is the action auditable" — they are complementary layers.

### Q42. Could someone bypass the AI by calling the blockchain directly with their wallet?
Registration finalization is designed to occur only after the verification flow succeeds, and the doctor whitelist is admin-controlled following that verification. An attacker cannot self-add to the whitelist. That said, securing the binding between the off-chain verification result and the on-chain registration call is an important production hardening — using signed attestations from the verification service — which I would formalize beyond the prototype.

### Q43. What face-api.js models exactly did you use and what is each for?
Three. **SsdMobilenetv1** for face detection (finding the face and a confidence score). **FaceLandmark68Net** for locating 68 facial landmarks, which aligns the face for accurate encoding. **FaceRecognitionNet** for producing the 128-dimensional descriptor used in matching. I also used the expression model for the smile-based liveness check.

### Q44. What detection confidence did you observe?
Around 99.7 percent confidence on the reference photo and about 97 percent on the live webcam image. The live image is slightly lower because of real-world conditions — lighting, angle, motion — which is expected. Both are high enough that detection itself was never the weak link; the matching distance was the decisive metric.

### Q45. If the camera quality is poor in a rural clinic, does the system fail?
Detection confidence and match reliability do depend on image quality. Very poor lighting or a low-resolution camera could push a genuine match's distance up or fail detection entirely. Mitigations include a minimum-quality check before accepting a frame, on-screen guidance to improve framing and lighting, and allowing multiple capture attempts. This robustness testing across real device conditions is part of the planned clinical validation.
