# Doctor Registration - Verification Flow

## Overview

The doctor registration process now has a complete 3-stage verification pipeline:
1. **Identity Check** - Verify doctor ID and name match database records
2. **Liveness + Face Recognition** - Validate smile (liveness) + biometric face match
3. **Secure Registration** - Finalize with password and blockchain registration

---

## Complete Verification Pipeline

### Stage 1: Identity Lookup (Frontend)
**File:** `frontend/pages/registerDoctor.js` - Step 1

```
User Input: Doctor ID + Full Name
    ↓
API Call: POST /api/checkDoctor
    ↓
Backend Validation:
  - Doctor ID exists in database
  - Name matches stored record
  - Doctor not already registered
    ↓
Success: Return reference photo URL
```

---

### Stage 2: Liveness Check + Face Recognition (Frontend + Backend)

#### Step 2A: Frontend Smile Detection (Liveness Check)
**File:** `frontend/pages/registerDoctor.js` - Step 2, `startLivenessCheck()`

```
User Action: Click "Start Liveness Check"
    ↓
Frontend AI Processing (face-api.js):
  - Load Models: ssdMobilenetv1, faceLandmark68Net, 
                 faceRecognitionNet, faceExpressionNet
  - Every 500ms: Detect face AND check expressions
  - Monitor: happy expression score (0 to 1)
    ↓
Liveness Detection:
  - Smile Score > 0.7? → Pass Liveness Check
  - On Success: Capture live image frame → Call verifyBiometrics()
  - On Failure: Show error, allow retry
```

**Frontend Metrics Logged:**
```
[v0] LIVENESS - AI Inference Time: XXX ms
[v0] LIVENESS - Face Confidence Score: XX%
[v0] LIVENESS - Smile detected! Score: XX%
```

---

#### Step 2B: Backend Liveness Verification + Face Recognition
**File:** `frontend/pages/api/verifyFace.js`

```
API Request: POST /api/verifyFace
  Payload:
    - doctorId
    - referencePhotoUrl (from identity check)
    - liveImageBase64 (captured after smile detected)

    ↓

Backend Processing (Node.js + face-api):

  ┌─────────────────────────────────────────┐
  │ STEP 1: Load AI Models (if not loaded) │
  └─────────────────────────────────────────┘
    - ssdMobilenetv1 (face detection)
    - faceLandmark68Net (landmarks)
    - faceRecognitionNet (descriptors)
    - faceExpressionNet (expressions)

  ┌──────────────────────────────────────────────────────────┐
  │ STEP 2: LIVENESS CHECK (NEW! - Validates smile on backend)│
  └──────────────────────────────────────────────────────────┘
    - checkSmileDetection(liveImage, threshold=0.7)
    - Detect face expressions in live image
    - If smile score < 0.7 → REJECT ✗
    - If smile score >= 0.7 → PASS ✓ (continue to face matching)

  ┌─────────────────────────────────────────┐
  │ STEP 3: Load Reference & Live Images   │
  └─────────────────────────────────────────┘
    - Read reference photo from disk
    - Decode live image from Base64

  ┌──────────────────────────────────────────┐
  │ STEP 4: Extract Face Descriptors       │
  └──────────────────────────────────────────┘
    - Reference Photo → 128-dim descriptor
    - Live Image → 128-dim descriptor

  ┌──────────────────────────────────────────┐
  │ STEP 5: Compare Face Descriptors       │
  └──────────────────────────────────────────┘
    - Euclidean distance calculation
    - Threshold: 0.6
    - If distance <= 0.6 → Match ✓
    - If distance > 0.6 → No Match ✗

Response:
  ✓ If LIVENESS PASSED AND FACE MATCHED:
    {
      verified: true,
      message: "Liveness check and face biometric match successful!",
      metrics: {
        livenessCheckPassed: true,
        smileScore: "XX%",
        smileCheckTime: "XXX ms",
        euclideanDistance: "X.XXXX",
        matchConfidence: "XX%",
        totalLatency: "XXXX ms"
      }
    }

  ✗ If LIVENESS FAILED:
    {
      verified: false,
      error: "Liveness check failed: No smile detected. Please smile at the camera."
    }

  ✗ If LIVENESS PASSED BUT FACE DIDN'T MATCH:
    {
      verified: false,
      error: "Face does not match. Distance: X.XXXX (threshold: 0.6)"
    }
```

---

### Stage 3: Secure Registration (Backend)
**File:** `frontend/pages/api/completeDoctorRegistration.js`

```
Only accessible AFTER Stage 2 verification passes!

User Input: Password + Wallet Address
    ↓
API Call: POST /api/completeDoctorRegistration
    ↓
Backend Processing:
  1. Hash password using bcrypt (salt=10)
  2. Get current nonce from admin wallet
  3. Execute Tx 1: registerDoctorData() [blockchain]
  4. Execute Tx 2: registerDoctor() [blockchain]
  5. Update local database with password hash & wallet
    ↓
Success: Doctor registration complete!
```

---

## Security Features

### Frontend Layer
✓ **Smile Detection (Liveness Check)**
  - Prevents spoofing with photos/videos
  - Requires real facial expression

✓ **Face-API Models Loaded**
  - ssdMobilenetv1: Robust face detection
  - faceRecognitionNet: 128-dimensional face embedding
  - faceExpressionNet: Expression/emotion detection

### Backend Layer (NEW IMPLEMENTATIONS)
✓ **Backend Smile Verification** (NEW)
  - Re-validates smile on the server
  - Prevents frontend bypass attacks
  - Logs smile confidence score

✓ **Face Recognition**
  - Reference photo vs live image comparison
  - Euclidean distance-based matching
  - Confidence score calculation

✓ **Blockchain Registration**
  - Immutable doctor registration record
  - Nonce management to prevent replay attacks

---

## API Endpoints Summary

| Endpoint | Method | Purpose | Key Feature |
|----------|--------|---------|------------|
| `/api/checkDoctor` | POST | Identity verification | Validates ID + Name |
| `/api/verifyFace` | POST | **Liveness + Face Match** | **NEW: Backend smile check** |
| `/api/completeDoctorRegistration` | POST | Finalize registration | Blockchain integration |

---

## File Changes Made

1. **`frontend/lib/face-api-server.js`**
   - Added: `checkSmileDetection(image, threshold)` function
   - Validates smile score on backend

2. **`frontend/pages/api/verifyFace.js`**
   - Added: Backend liveness check before face matching
   - Added: Smile score to metrics
   - Updated: Error handling for liveness failures
   - Updated: Response includes livenessCheckPassed flag

3. **`frontend/pages/registerDoctor.js`**
   - Updated: Comments to clarify liveness + face recognition flow
   - Updated: Metrics logging to include smile score
   - Updated: Success message to show both checks passed

---

## Testing the Flow

### Success Scenario
1. Enter correct doctor ID + name → Pass identity check ✓
2. Smile at camera → Smile detected (frontend) ✓
3. Backend validates smile again ✓
4. Backend matches face with reference photo ✓
5. Enter password → Blockchain registration ✓

### Failure Scenarios
1. **Wrong smile**: Smile score < 0.7 → Rejected before face matching
2. **Face mismatch**: Even if smile detected, distance > 0.6 → Rejected
3. **Both checks fail**: Both errors returned in response

---

## Performance Metrics Tracked

- Smile detection time (ms)
- Face confidence scores (%)
- Descriptor computation time (ms)
- Euclidean distance (face matching)
- Total latency (end-to-end)
- Gas used (blockchain)
- Transaction costs (USD)

All metrics logged to console for debugging.

---

## How to Verify in Console

Open DevTools (F12) and check console logs:

```
[v0] LIVENESS - Smile detected! Score: 95.23%
[v0] Backend AI Metrics: { livenessCheckPassed: true, smileScore: "95.23", ... }
[v0] Liveness Check Passed: true
[v0] Match Confidence: 99%
[v0] Total Latency: 1234 ms
```
