
  const currentChallengeId = challengeOrder[challengeIndex];
  const cameraLocked = phase === "challenge" || phase === "verifying";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-teal-700 mb-6">
          {step === 1 && "Step 1: Identity Lookup"}
          {step === 2 && "Step 2: Anti-Spoofing Verification"}
          {step === 3 && "Step 3: Secure Registration"}
        </h1>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {/* --- STEP 1: FORM --- */}
        {step === 1 && (
          <form onSubmit={handleCheckIdentity} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-bold mb-2">Doctor ID</label>
              <input
                type="number"
                className="w-full p-3 border rounded shadow-sm focus:ring-2 focus:ring-teal-500"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-bold mb-2">Full Name</label>
              <input
                type="text"
                className="w-full p-3 border rounded shadow-sm focus:ring-2 focus:ring-teal-500"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                required
              />
            </div>
            <button
              disabled={loading}
              className="w-full bg-teal-600 text-white py-3 rounded hover:bg-teal-700 font-bold transition duration-200"
            >
              {loading ? "Searching..." : "Next"}
            </button>
          </form>
        )}

        {/* --- STEP 2: CAMERA & STEP-BY-STEP LIVENESS UI --- */}
        {step === 2 && (
          <div className="flex flex-col items-center w-full">
            {!modelsLoaded ? (
              <p className="text-gray-500 font-semibold py-8">Initializing AI Engines...</p>
            ) : (
              <>
                <div className="w-full bg-blue-100 border-l-4 border-blue-600 text-blue-800 p-4 mb-3 text-center rounded">
                  <p className="font-bold text-base" aria-live="polite">
                    {statusBanner || (currentChallengeId ? titleFor(challengeOrder, challengeIndex) : "")}
                  </p>
                  {challengeOrder.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      {challengeOrder.map((id, idx) => {
                        const label = CHALLENGE_META[id].label;
                        const done = completedSteps.includes(id);
                        const active = challengeIndex === idx && phase === "challenge";
                        return (
                          <span
                            key={id}
                            className={`px-2.5 py-1 rounded text-xs font-bold ${
                              done
                                ? "bg-green-600 text-white"
                                : active
                                ? "bg-blue-600 text-white animate-pulse"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {done ? `✓ ${label}` : `${idx + 1}. ${label}`}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {spoofWarning && (
                  <div className="w-full bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-center text-sm font-bold">
                    {spoofWarning}
                  </div>
                )}

                {cameras.length > 1 && (
                  <div className="w-full mb-3">
                    <label htmlFor="camera-select" className="block text-xs font-bold text-gray-600 mb-1">
                      Camera {cameraLocked && "(locked during the test)"}
                    </label>
                    <select
                      id="camera-select"
                      className="w-full p-2 border rounded text-sm disabled:bg-gray-100"
                      value={cameraId}
                      disabled={cameraLocked}
                      onChange={(e) => setCameraId(e.target.value)}
                    >
                      <option value="">Default camera</option>
                      {cameras.map((c, i) => (
                        <option key={c.deviceId} value={c.deviceId}>
                          {c.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {faceLuma !== null && faceLuma < MIN_FACE_LUMA && (
                  <div className="w-full bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-2 rounded mb-3 text-center text-sm">
                    {"Face too dark (brightness " + faceLuma + "/255). Face a window or lamp, raise screen brightness, or switch to DroidCam."}
                  </div>
                )}

                <div className="relative border-4 border-black rounded-lg overflow-hidden mb-3 bg-black">
                  <Webcam
                    key={cameraId || "default"}
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width={400}
                    height={300}
                    videoConstraints={videoConstraints}
                    onUserMedia={handleUserMedia}
                  />

                  {faceBox && (
                    <div
                      aria-hidden="true"
                      className={`absolute rounded-md border-4 transition-colors duration-150 ${
                        faceBox.ok ? "border-green-500" : "border-red-500"
                      }`}
                      style={{ left: faceBox.left, top: faceBox.top, width: faceBox.width, height: faceBox.height }}
                    />
                  )}

                  <div className="absolute top-2 right-2 bg-black/75 text-white px-3 py-1 rounded text-xs font-bold">
                    {phase === "warmup" && "Starting camera"}
                    {phase === "aligning" && "Not started"}
                    {phase === "challenge" && `Step ${challengeIndex + 1}/${challengeOrder.length}`}
                    {phase === "verifying" && "Live verified"}
                    {(phase === "failed" || phase === "blocked") && "Stopped"}
                  </div>

                  {phase === "challenge" && secondsLeft !== null && (
                    <div
                      className={`absolute top-2 left-2 px-3 py-1 rounded text-sm font-bold text-white ${
                        secondsLeft <= 3 ? "bg-red-600" : "bg-teal-600"
                      }`}
                      aria-live="off"
                    >
                      {secondsLeft}s
                    </div>
                  )}

                  {phase === "aligning" && (
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/60">
                      <div
                        className="h-full bg-green-500 transition-[width] duration-100"
                        style={{ width: `${Math.round(lockProgress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {liveTelemetry && <p className="text-xs font-mono text-gray-500 mb-2">{liveTelemetry}</p>}

                <div
                  className={`w-full py-3 px-4 rounded font-bold text-white text-center transition ${
                    phase === "verifying"
                      ? "bg-green-600"
                      : phase === "failed" || phase === "blocked"
                      ? "bg-gray-600"
                      : "bg-yellow-500"
                  }`}
                >
                  {bottomStatus || (currentChallengeId ? CHALLENGE_META[currentChallengeId].statusText : "")}
                </div>

                {phase === "failed" && (
                  <button
                    type="button"
                    onClick={retryLiveness}
                    disabled={attemptsLeft === 0}
                    className="w-full mt-3 bg-teal-600 text-white py-3 rounded hover:bg-teal-700 font-bold disabled:bg-gray-400"
                  >
                    {attemptsLeft === 0
                      ? "No attempts left — wait 10 minutes"
                      : `Try again${attemptsLeft !== null ? ` (${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left)` : ""}`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

