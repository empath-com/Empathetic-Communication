function processNovaOutput(parsed, socket, state) {
  // ─ Audio chunks ───────────────────────────────────────────────
  if (parsed.type === "audio") {
    // First audio chunk from Python means the response is flowing —
    // re-enable audio input so barge-in works during playback.
    if (state.waitingForResponse) {
      state.setWaitingForResponse(false);
      state.clearResponseWaitTimeout();
      console.log("🔓 First audio chunk received — waitingForResponse cleared, barge-in enabled");
    }
    const b64Len = parsed.data?.length ?? 0;
    console.log(`🔊 AUDIO CHUNK from Python: gen=${parsed.generation_id ?? "?"}, seq=${parsed.chunk_seq ?? "?"}, b64_len=${b64Len}`);
    console.log(`🔊 Emitting audio-chunk to socket ${socket.id} (connected=${socket.connected})`);
    socket.emit("audio-chunk", { data: parsed.data });
    console.log("🔊 audio-chunk emitted OK");
  }
  // ─ Debug messages ───────────────────────────────────────────
  else if (parsed.type === "debug") {
    console.log("🐞 NOVA DEBUG:", parsed.text);
    socket.emit("nova-debug", { message: parsed.text, timestamp: Date.now() });
    // "Nova Sonic ready" may arrive as a debug message
    if (parsed.text && parsed.text.includes("Nova Sonic ready")) {
      state.setNovaReady(true);
      console.log("✅ NOVA SONIC READY (via debug event) — novaReady=true");
      socket.emit("voice-started", { status: "Voice session started" });
      socket.emit("nova-started", { status: "Voice session started" });
    }
  }
  // ─ Voice empathy evaluation results ──────────────────────────
  else if (parsed.type === "voice_empathy_result") {
    console.log("🎤 VOICE EMPATHY RESULT:", parsed.content?.substring(0, 100));
    socket.emit("voice-empathy-result", { content: parsed.content });
  }
  // ─ Text messages ─────────────────────────────────────────────
  else if (parsed.type === "text") {
    if (state.waitingForResponse) {
      state.setWaitingForResponse(false);
      state.clearResponseWaitTimeout();
      console.log("🔓 First text chunk received — waitingForResponse cleared");
    }
    console.log("💬 NOVA TEXT:", parsed.text);
    socket.emit("text-message", { text: parsed.text });
    if (parsed.text.includes("Nova Sonic ready")) {
      state.setNovaReady(true);
      console.log("✅ NOVA SONIC READY - Voice empathy evaluation enabled");
      socket.emit("voice-started", { status: "Voice session started" });
      socket.emit("nova-started", { status: "Voice session started" });
    }
  }
  // ─ Empathy feedback ──────────────────────────────────────────
  else if (parsed.type === "empathy") {
    console.log("🧠 VOICE EMPATHY FEEDBACK:", parsed.content?.substring(0, 100));
    socket.emit("empathy-feedback", { content: parsed.content });
  }
  // ─ Raw empathy data for frontend processing ──────────────────────────────────────────
  else if (parsed.type === "empathy_data") {
    console.log("🧠 RAW VOICE EMPATHY DATA RECEIVED:", parsed.content?.substring(0, 100));
    try {
      const empathyData = JSON.parse(parsed.content);
      const tool = empathyData.evaluation_tool === "PRISM" ? "PRISM" : "CARE";
      const careCriteria = [
        "making_feel_at_ease",
        "letting_tell_story",
        "really_listening",
        "interested_in_whole_person",
        "understanding_concerns",
        "showing_care_compassion",
        "being_positive",
        "explaining_clearly",
        "helping_take_control",
        "making_plan_of_action",
      ];
      const prismCriteria = ["prepare", "recognise", "interact", "self_assess", "master"];
      const criteria = tool === "PRISM" ? prismCriteria : careCriteria;
      const scoreValues = criteria
        .map((key) => Number(empathyData[key]))
        .filter((value) => Number.isFinite(value));
      const overallScore = scoreValues.length
        ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(1))
        : 3;

      const transformedData = {
        empathy_tool: tool,
        overall_score: overallScore,
        summary: empathyData.judge_reasoning?.overall_assessment || "",
        strengths: empathyData.feedback?.strengths || [],
        recommendations: empathyData.feedback?.improvement_suggestions || [],
        forward_target: empathyData.feedback?.forward_target || "",
        timestamp: Date.now(),
        source: "voice",
        ...Object.fromEntries(criteria.map((key) => [key, Number(empathyData[key]) || 0])),
      };
      console.log("🧠 SENDING VOICE EMPATHY DATA TO FRONTEND - Score:", transformedData.overall_score);
      socket.emit("empathy-data", transformedData);
    } catch (e) {
      console.error("❌ Failed to parse voice empathy data:", e);
      console.error("❌ Raw empathy content:", parsed.content);
    }
  }
  // ─ Diagnosis completion ──────────────────────────────────────
  else if (parsed.type === "diagnosis_complete") {
    console.log("🎯 DIAGNOSIS COMPLETE:", parsed.text);
    if (!state.diagnosisCompleted) {
      state.setDiagnosisCompleted(true);
      socket.emit("diagnosis-complete", { message: parsed.text, completed: true });
    }
  }
  else if (parsed.type === "diagnosis_verdict") {
    console.log("🩺 DIAGNOSIS VERDICT:", parsed.verdict);
    // Do not auto-complete sessions from diagnosis_verdict alone.
    // Voice completion should only occur when the assistant response
    // explicitly signals completion (diagnosis_complete / SESSION COMPLETED),
    // matching text-generation streaming behavior.
  }
  // ─ Voice user message (saved to DB, frontend triggers empathy eval) ─
  else if (parsed.type === "user_message") {
    console.log("🎤 VOICE USER MESSAGE:", parsed.text?.substring(0, 50));
    socket.emit("voice-user-message", { text: parsed.text, message_id: parsed.message_id });
  }
  // ─ Realtime transcript stream (Transcribe) ───────────────────
  else if (parsed.type === "transcript_partial") {
    socket.emit("voice-transcript-partial", { text: parsed.text });
    // Also surface in the debug panel so it's visible during speaking
    socket.emit("nova-debug", { message: `🎙️ [partial] ${parsed.text}`, timestamp: Date.now() });
  }
  else if (parsed.type === "transcript_final") {
    socket.emit("voice-transcript-final", { text: parsed.text });
    socket.emit("nova-debug", { message: `🎙️ [final] ${parsed.text}`, timestamp: Date.now() });
  }
  // ─ Interrupt / barge-in events ───────────────────────────────
  else if (parsed.type === "voice_interrupted") {
    console.log("⛔ VOICE INTERRUPTED:", parsed.reason);
    socket.emit("voice-interrupted", {
      reason: parsed.reason,
      generation_id: parsed.generation_id,
    });
  }
}

function processNovaPlainTextLine(line, socket, state) {
  // Plain-text fallback
  console.log("[python]", line);
  if (line.includes("Nova Sonic ready")) {
    state.setNovaReady(true);
    socket.emit("voice-started", {
      status: "Voice session started",
    });
    socket.emit("nova-started", {
      status: "Voice session started",
    });
  }
  // Handle empathy feedback in plain text fallback
  if (line.includes("**Empathy Coach:**") || line.includes("**🎤 Voice Empathy Coach:**")) {
    socket.emit("empathy-feedback", { content: line });
  }
  // Forward voice transcriptions to text chat for empathy evaluation
  if (line.includes("User:") || line.includes("Assistant:")) {
    console.log("📝 FORWARDING VOICE TEXT:", line.substring(0, 50));
    socket.emit("text-message", { text: line });
  }
  // Handle empathy evaluation status updates
  if (line.includes("MANUAL EMPATHY:") || line.includes("🧠") || line.includes("VOICE EMPATHY:")) {
    console.log("🧠 EMPATHY STATUS:", line);
    // Forward empathy status to frontend for debugging
    socket.emit("empathy-status", { message: line, timestamp: Date.now() });
  }
  // Handle diagnosis completion in plain text fallback
  if (line.includes("SESSION COMPLETED") && !state.diagnosisCompleted) {
    state.setDiagnosisCompleted(true);
    socket.emit("diagnosis-complete", { message: "Session completed successfully", completed: true });
  }
}

module.exports = { processNovaOutput, processNovaPlainTextLine };
