# Verification Architecture Diagram

## Before Fix: Architecture Gap

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCTOR REGISTRATION FLOW (BEFORE)                     │
└─────────────────────────────────────────────────────────────────────────┘

FRONTEND (React)                    BACKEND (Node.js)
───────────────                     ──────────────────

Step 1: Identity
┌──────────────────┐
│ Doctor ID + Name │
│ Verify Identity  │
└────────┬─────────┘
         │
         ├─→ /api/checkDoctor ──→ ┌────────────────────┐
         │                        │ Check ID in DB     │
         │                        │ Match Name         │
         │                        │ Return Photo URL   │
         │  ✓                     └────────┬───────────┘
         └─────────────────────────────────┘

Step 2: Liveness Check (FRONTEND ONLY)
┌──────────────────────────┐
│ Load AI Models           │
│ ├─ ssdMobilenetv1        │
│ ├─ faceLandmark68Net     │
│ ├─ faceRecognitionNet    │
│ └─ faceExpressionNet     │
└────────┬─────────────────┘
         │
         ├─ Every 500ms:
         │  ├─ Detect Face
         │  └─ Check Smile Score
         │
         ├─ Smile > 0.7? ✓
         │
         ├─ Capture Image from Webcam
         └─→ Convert to Base64

Step 2B: Send to Backend
         │
         ├─→ /api/verifyFace
         │   Payload:
         │   ├─ doctorId
         │   ├─ referencePhotoUrl
         │   └─ liveImageBase64
         │
         │                        ┌──────────────────────────┐
         │                        │ BACKEND VERIFICATION     │
         │                        │ ❌ MISSING: Smile Check! │
         │                        │                          │
         │                        │ ✓ Load Models           │
         │                        │ ✓ Load Reference Photo  │
         │                        │ ✓ Extract Descriptors   │
         │                        │ ✓ Compare Faces         │
         │                        │ └─ Return Result        │
         │                        └────────┬─────────────────┘
         │  ✓
         └─────────────────────────────────┘

Step 3: Finalize Registration
         │
         ├─→ /api/completeDoctorRegistration
         │   ├─ Hash Password
         │   ├─ Register on Blockchain
         │   └─ Store in Database
         │
         └─ ✓ Complete!

SECURITY ISSUE:
═════════════════════════════════════════════════════════════
Backend never validates that smile was actually detected!
A malicious actor could:
  • Modify frontend code to skip smile detection
  • Send a photo instead of live video
  • Bypass liveness check entirely
═════════════════════════════════════════════════════════════
```

---

## After Fix: Complete End-to-End Verification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   DOCTOR REGISTRATION FLOW (AFTER)                       │
└─────────────────────────────────────────────────────────────────────────┘

FRONTEND (React)                    BACKEND (Node.js)
───────────────                     ──────────────────

Step 1: Identity
┌──────────────────┐
│ Doctor ID + Name │
└────────┬─────────┘
         │
         ├─→ /api/checkDoctor ──→ ┌────────────────────┐
         │                        │ ✓ Check ID in DB   │
         │                        │ ✓ Match Name       │
         │                        │ ✓ Return Photo URL │
         │  ✓                     └────────┬───────────┘
         └─────────────────────────────────┘

Step 2A: Frontend Liveness Detection
┌────────────────────────────────────┐
│ Frontend Smile Detection            │
│ ├─ Load AI Models                  │
│ ├─ Every 500ms: Check Expressions  │
│ ├─ Smile Score > 0.7? ✓            │
│ └─ Capture Image                   │
└────────┬─────────────────────────────┘

Step 2B: Backend Dual Validation (NEW!)
         │
         ├─→ /api/verifyFace ────→ ┌────────────────────────────────┐
         │   Payload:              │ BACKEND VERIFICATION (NEW!)    │
         │   ├─ doctorId           │                                │
         │   ├─ referencePhotoUrl  │ ✓ Load AI Models              │
         │   └─ liveImageBase64    │                                │
         │                         │ ⭐ LAYER 1: Liveness Check   │
         │                         │    └─ Re-validate Smile       │
         │                         │    └─ Score must be > 0.7     │
         │                         │    └─ If FAIL → REJECT here!  │
         │                         │                                │
         │                         │ ⭐ LAYER 2: Face Recognition  │
         │                         │    ├─ Load Reference Photo    │
         │                         │    ├─ Extract Descriptors     │
         │                         │    └─ Compare Faces           │
         │                         │    └─ Distance <= 0.6? ✓      │
         │                         │                                │
         │                         │ Return Metrics:                │
         │                         │  ├─ livenessCheckPassed       │
         │                         │  ├─ smileScore                │
         │                         │  ├─ matchConfidence           │
         │                         │  └─ euclideanDistance         │
         │  ✓                      └────────┬─────────────────────┘
         └─────────────────────────────────┘

Step 3: Finalize Registration (Only if Step 2 PASSES)
         │
         ├─→ /api/completeDoctorRegistration
         │   ├─ Hash Password
         │   ├─ Register on Blockchain (2 Txs)
         │   └─ Store in Database
         │
         └─ ✓ Complete!

SECURITY IMPROVEMENT:
═════════════════════════════════════════════════════════════
✓ Frontend enforces smile detection (UX layer)
✓ Backend independently validates smile (security layer)
✓ Face recognition locks biometric match
✓ Blockchain finalizes registration immutably

Attack Prevention:
  ✗ Can't modify frontend → Backend still validates
  ✗ Can't send photo → Smile detection fails
  ✗ Can't use old video → Fresh expressions checked
═════════════════════════════════════════════════════════════
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA FLOW THROUGH SYSTEM                     │
└─────────────────────────────────────────────────────────────────┘

┌─ Input Layer
│   ├─ Doctor ID
│   ├─ Doctor Name
│   ├─ Webcam Stream (Live Video)
│   └─ Password + Wallet Address
│
├─ Process Layer 1: Identity Verification
│   ├─ Look up in Doctor Database
│   ├─ Verify Name Match
│   └─ Retrieve Reference Photo (stored during onboarding)
│
├─ Process Layer 2: Liveness Verification (NEW!)
│   ├─ Frontend: Detect smile in stream (threshold: 0.7)
│   ├─ Frontend: Capture frame when smile detected
│   ├─ Backend: Re-validate smile in captured frame
│   │   └─ If score < 0.7: REJECT ❌ (don't continue)
│   │   └─ If score >= 0.7: PASS ✓ (continue to face match)
│   └─ Return Smile Metrics
│
├─ Process Layer 3: Face Recognition
│   ├─ Extract descriptor from Reference Photo (128-dim vector)
│   ├─ Extract descriptor from Live Frame (128-dim vector)
│   ├─ Calculate Euclidean distance between descriptors
│   ├─ Compare to threshold (0.6)
│   │   └─ If distance <= 0.6: Match ✓
│   │   └─ If distance > 0.6: No Match ❌
│   └─ Return Face Metrics
│
├─ Process Layer 4: Blockchain Registration
│   ├─ Hash password using bcrypt
│   ├─ Get wallet nonce
│   ├─ Tx 1: registerDoctorData()
│   ├─ Tx 2: registerDoctor()
│   └─ Return Transaction Hashes
│
└─ Output Layer
    ├─ Registration Status (Success/Failure)
    ├─ Verification Metrics
    ├─ Transaction Hash
    └─ Error Messages (if applicable)
```

---

## Validation Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                  VALIDATION LAYERS (4-LAYER SYSTEM)            │
└─────────────────────────────────────────────────────────────────┘

User Registration Request
         │
         ▼
┌─────────────────────────────────────────┐
│ LAYER 1: Identity Validation             │ (Backend)
├─────────────────────────────────────────┤
│ Check:                                  │
│  ✓ Doctor ID exists in database         │
│  ✓ Full name matches record             │
│  ✓ Doctor not already registered        │
│                                          │
│ Fail Path: Return error to frontend     │
│ Pass Path: Return reference photo URL   │
└────────────┬──────────────────────────────┘
             │
             ▼ (Pass)
┌─────────────────────────────────────────┐
│ LAYER 2: Liveness Validation (NEW!)      │ (Frontend + Backend)
├─────────────────────────────────────────┤
│ Frontend Checks:                        │
│  ✓ Face detected in webcam stream       │
│  ✓ Smile expression score > 0.7         │
│                                          │
│ Backend Checks (Independent):           │
│  ✓ Smile score in captured image > 0.7  │
│  ✓ Re-validates on server (no bypass)   │
│                                          │
│ Fail Path: Return liveness error        │
│ Pass Path: Extract face descriptor     │
└────────────┬──────────────────────────────┘
             │
             ▼ (Pass)
┌─────────────────────────────────────────┐
│ LAYER 3: Face Recognition                │ (Backend)
├─────────────────────────────────────────┤
│ Check:                                  │
│  ✓ Face detected in reference photo     │
│  ✓ Face detected in live image          │
│  ✓ Euclidean distance <= 0.6            │
│  ✓ Match confidence >= threshold        │
│                                          │
│ Fail Path: Return face mismatch error   │
│ Pass Path: Proceed to blockchain        │
└────────────┬──────────────────────────────┘
             │
             ▼ (Pass)
┌─────────────────────────────────────────┐
│ LAYER 4: Blockchain Registration        │ (Backend)
├─────────────────────────────────────────┤
│ Check:                                  │
│  ✓ Password hashing successful          │
│  ✓ Tx 1: registerDoctorData() succeeds  │
│  ✓ Tx 2: registerDoctor() succeeds      │
│  ✓ Database update successful           │
│                                          │
│ Fail Path: Return blockchain error      │
│ Pass Path: Return success               │
└────────────┬──────────────────────────────┘
             │
             ▼
       ✓ REGISTRATION COMPLETE!
```

---

## API Endpoint Dependencies

```
┌─ /api/checkDoctor (Identity)
│   ├─ Input: doctorId, doctorName
│   ├─ Database: doctor_db.json
│   └─ Output: referencePhotoUrl
│
├─ /api/verifyFace (Liveness + Face Recognition) ⭐ ENHANCED
│   ├─ Input: doctorId, referencePhotoUrl, liveImageBase64
│   ├─ AI Models:
│   │   ├─ faceExpressionNet (NEW: for smile detection)
│   │   ├─ ssdMobilenetv1
│   │   ├─ faceLandmark68Net
│   │   └─ faceRecognitionNet
│   ├─ Filesystem: Read reference photo
│   ├─ Processing:
│   │   ├─ NEW: Check smile (threshold 0.7)
│   │   ├─ Extract descriptors
│   │   ├─ Compare faces (threshold 0.6)
│   │   └─ Generate metrics
│   └─ Output: verified, metrics, error
│
└─ /api/completeDoctorRegistration (Finalize)
    ├─ Input: doctorId, password, walletAddress
    ├─ Database: doctor_db.json
    ├─ Blockchain: Smart Contract
    │   ├─ registerDoctorData()
    │   └─ registerDoctor()
    └─ Output: success, txHash, metrics
```

---

## State Machine Diagram

```
                           Registration State Machine

                    ┌─────────────────────┐
                    │  START: No Doctor   │
                    │   Record Selected   │
                    └──────────┬──────────┘
                               │
                    INPUT: ID + Name
                               │
                               ▼
            ┌──────────────────────────────────┐
            │   STATE: Identity Verified       │  /api/checkDoctor
            │  (referencePhotoUrl retrieved)   │
            └──────────────────────────────────┘
                               │
              USER: Smile & Capture Live Image
                               │
                               ▼
    ┌────────────────────────────────────────────────┐
    │ STATE: Frontend Liveness Detected              │  Frontend
    │ (Smile score > 0.7, frame captured)            │  AI Model
    └────────────────────────────────────────────────┘
                               │
                  /api/verifyFace
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
        ✓ Backend Smile      ❌ Liveness
          Validated             Failed
        (score > 0.7)        (score < 0.7)
                │                 │
                ▼                 ▼
        ┌──────────────┐   REJECT
        │Face Match?   │   Return Error
        └────┬─────┬──┘
             │     │
          ✓  │     │  ❌
             ▼     ▼
          MATCH   MISMATCH
             │     │
             │     ▼
             │   REJECT
             │   Return Error
             │
             ▼
    ┌──────────────────────────────────┐
    │ STATE: Biometric Match Verified  │  /api/verifyFace
    │ (Face match confirmed)           │
    └──────────────────────────────────┘
             │
    INPUT: Password + Wallet
             │
             ▼
    ┌──────────────────────────────────┐
    │ STATE: Registration Finalizing   │  /api/completeDoctorRegistration
    │ (Blockchain Tx pending)          │
    └──────────────────────────────────┘
             │
         ✓ Txs Confirmed
             │
             ▼
    ┌──────────────────────────────────┐
    │ STATE: Registration Complete ✓   │
    │ (Doctor account created)         │
    └──────────────────────────────────┘
```

---

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY MODEL                              │
└─────────────────────────────────────────────────────────────────┘

┌─ LAYER 1: Frontend (User Experience)
│   └─ Smile detection provides real-time feedback
│      "Please smile" → User smiles → Automatic capture
│      Prevents obviously non-liveness scenarios
│
├─ LAYER 2: Backend (Security Verification) ⭐ NEW
│   └─ Independent smile validation
│      Can't modify frontend to bypass this
│      Malicious user can't send photo instead of video
│      Prevents replay attacks with old recordings
│
├─ LAYER 3: Biometric Matching (Identity)
│   ├─ 128-dimensional face descriptors
│   ├─ Euclidean distance matching
│   └─ Prevents impersonation with different face
│
├─ LAYER 4: Blockchain (Immutability)
│   ├─ Doctor registration stored on-chain
│   ├─ Nonce management prevents replay
│   ├─ Smart contract enforces rules
│   └─ Prevents registration tampering
│
└─ LAYER 5: Cryptographic (Password)
    └─ Bcrypt with salt=10
       Prevents dictionary/brute force attacks
```

---

## Summary

**Before Fix:** Smile detection only on frontend (UX layer) ❌
- No server-side validation
- Could be bypassed by frontend modification

**After Fix:** Smile detection on both frontend AND backend ✅
- UX layer: Real-time feedback with frontend AI
- Security layer: Independent backend validation
- Can't bypass either without possessing real liveness

This creates a **defense-in-depth approach** to liveness verification!
