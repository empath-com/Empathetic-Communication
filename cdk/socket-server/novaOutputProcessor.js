const { createLogger } = require("./logger");

function getLogger(socket, logger) {
  if (logger) return logger;
  return createLogger({
    service: "socket-server",
    component: "nova-output",
    role: "socket",
    socketId: socket?.id,
    requestId: socket?.data?.requestId || null,
    route: "nova_output",
  });
}

function processNovaOutput(parsed, socket, state, logger = null) {
  const log = getLogger(socket, logger).child({
    route: "nova_output",
    sessionId: parsed?.session_id || null,
  });

  // ─ Audio chunks ───────────────────────────────────────────────
  if (parsed.type === "audio") {
    // First audio chunk from Python means the response is flowing —
    // re-enable audio input so barge-in works during playback.
    if (state.waitingForResponse) {
      state.setWaitingForResponse(false);
      state.clearResponseWaitTimeout();
      log.debug("Nova waiting-for-response cleared by audio", {
        event: "nova_waiting_cleared_audio",
      });
    }
    const b64Len = parsed.data?.length ?? 0;
    log.debug("Nova audio chunk", {
      event: "nova_audio_chunk",
      generationId: parsed.generation_id ?? null,
      chunkSeq: parsed.chunk_seq ?? null,
      base64Length: b64Len,
      socketConnected: socket.connected,
    });
    socket.emit("audio-chunk", { data: parsed.data });
    log.debug("Nova audio chunk emitted", {
      event: "nova_audio_chunk_emitted",
    });
  }
  // ─ Debug messages ───────────────────────────────────────────
  else if (parsed.type === "debug") {
    log.debug("Nova debug", {
      event: "nova_debug",
      text: parsed.text,
    });
    socket.emit("nova-debug", { message: parsed.text, timestamp: Date.now() });
    // "Nova Sonic ready" may arrive as a debug message
    if (parsed.text && parsed.text.includes("Nova Sonic ready")) {
      state.setNovaReady(true);
      log.info("Nova ready", {
        event: "nova_ready",
        source: "debug",
      });
      socket.emit("voice-started", { status: "Voice session started" });
      socket.emit("nova-started", { status: "Voice session started" });
    }
  }
  // ─ Voice empathy evaluation results ──────────────────────────
  else if (parsed.type === "voice_empathy_result") {
    log.info("Voice empathy result", {
      event: "voice_empathy_result",
      preview: parsed.content?.substring(0, 100),
    });
    socket.emit("voice-empathy-result", { content: parsed.content });
  }
  // ─ Text messages ─────────────────────────────────────────────
  else if (parsed.type === "text") {
    if (state.waitingForResponse) {
      state.setWaitingForResponse(false);
      state.clearResponseWaitTimeout();
      log.debug("Nova waiting-for-response cleared by text", {
        event: "nova_waiting_cleared_text",
      });
    }
    log.debug("Nova text output", {
      event: "nova_text_output",
      textPreview: parsed.text?.substring(0, 120),
    });
    socket.emit("text-message", { text: parsed.text });
    if (parsed.text.includes("Nova Sonic ready")) {
      state.setNovaReady(true);
      log.info("Nova ready", {
        event: "nova_ready",
        source: "text",
      });
      socket.emit("voice-started", { status: "Voice session started" });
      socket.emit("nova-started", { status: "Voice session started" });
    }
  }
  // ─ Empathy feedback ──────────────────────────────────────────
  else if (parsed.type === "empathy") {
    log.info("Voice empathy feedback", {
      event: "voice_empathy_feedback",
      preview: parsed.content?.substring(0, 100),
    });
    socket.emit("empathy-feedback", { content: parsed.content });
  }
  // ─ Raw empathy data for frontend processing ──────────────────────────────────────────
  else if (parsed.type === "empathy_data") {
    log.debug("Voice empathy raw data received", {
      event: "voice_empathy_data_received",
      preview: parsed.content?.substring(0, 100),
    });
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
      log.info("Voice empathy data emitted", {
        event: "voice_empathy_data_emitted",
        overallScore: transformedData.overall_score,
      });
      socket.emit("empathy-data", transformedData);
    } catch (e) {
      log.error("Failed to parse voice empathy data", {
        event: "voice_empathy_parse_error",
      }, e);
    }
  }
  // ─ Diagnosis completion ──────────────────────────────────────
  else if (parsed.type === "diagnosis_complete") {
    log.info("Diagnosis complete", {
      event: "voice_diagnosis_complete",
    });
    if (!state.diagnosisCompleted) {
      state.setDiagnosisCompleted(true);
      socket.emit("diagnosis-complete", { message: parsed.text, completed: true });
    }
  }
  else if (parsed.type === "diagnosis_verdict") {
    log.info("Diagnosis verdict", {
      event: "voice_diagnosis_verdict",
      verdict: parsed.verdict,
    });
    // Do not auto-complete sessions from diagnosis_verdict alone.
    // Voice completion should only occur when the assistant response
    // explicitly signals completion (diagnosis_complete / SESSION COMPLETED),
    // matching text-generation streaming behavior.
  }
  // ─ Voice user message (saved to DB, frontend triggers empathy eval) ─
  else if (parsed.type === "user_message") {
    log.debug("Voice user message", {
      event: "voice_user_message",
      preview: parsed.text?.substring(0, 50),
    });
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
    log.warn("Voice interrupted", {
      event: "voice_interrupted",
      reason: parsed.reason,
    });
    socket.emit("voice-interrupted", {
      reason: parsed.reason,
      generation_id: parsed.generation_id,
    });
  }
}

function processNovaPlainTextLine(line, socket, state, logger = null) {
  const log = getLogger(socket, logger).child({ route: "nova_plaintext" });
  // Plain-text fallback
  log.debug("Nova plaintext output", {
    event: "nova_plaintext_output",
    line,
  });
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
    log.debug("Forwarding voice text", {
      event: "voice_text_forwarded",
      preview: line.substring(0, 50),
    });
    socket.emit("text-message", { text: line });
  }
  // Handle empathy evaluation status updates
  if (line.includes("MANUAL EMPATHY:") || line.includes("🧠") || line.includes("VOICE EMPATHY:")) {
    log.debug("Voice empathy status", {
      event: "voice_empathy_status",
      statusLine: line,
    });
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
