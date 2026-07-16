const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { verifyToken, getStsCredentials } = require("./auth");

const app = express();
const server = createServer(app);

// CORS configuration: allow specific domain or default to all origins
const corsOrigin = process.env.CORS_ALLOWED_ORIGIN || "*";
console.log(`🌐 CORS configured for origin: ${corsOrigin}`);

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

// Track server startup time and state
const SERVER_START_TIME = Date.now();
let serverReady = false;
let lastHealthCheckTime = Date.now();
let healthCheckCount = 0;
let totalConnections = 0;

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  healthCheckCount++;
  lastHealthCheckTime = Date.now();
  const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  const metrics = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime_seconds: uptime,
    server_ready: serverReady,
    active_clients: io.engine.clientsCount,
    total_connections: totalConnections,
    health_checks: healthCheckCount,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
  console.log(`[${new Date().toISOString()}] Health check #${healthCheckCount} from ${req.ip} - Uptime: ${uptime}s, Clients: ${io.engine.clientsCount}`);
  res.json(metrics);
});

// ─── Socket.IO Connection ─────────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const decoded = await verifyToken(token);
    socket.userId = decoded.sub;
    socket.userEmail = decoded.email;
    console.log("🔐 User authenticated:", socket.userEmail);
    next();
  } catch (err) {
    console.error("🔐 Authentication failed:", err.message);
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  totalConnections++;
  console.log(`🔌 CLIENT CONNECTED: ${socket.id} (Total connections: ${totalConnections}, Active: ${io.engine.clientsCount})`);
  console.log(
    process.env.SM_DB_CREDENTIALS
      ? "✅ DB CREDENTIALS LOADED"
      : "❌ NO DB CREDENTIALS"
  );
  console.log(
    process.env.RDS_PROXY_ENDPOINT ? `✅ RDS PROXY: ${process.env.RDS_PROXY_ENDPOINT}` : "❌ NO RDS PROXY"
  );

  let novaProcess = null;
  let novaReady = false;
  let diagnosisCompleted = false;

  // Small delay then log active client count
  setTimeout(() => {
    console.log(`🔌 ACTIVE CLIENTS: ${io.engine.clientsCount}`);
  }, 100);

  socket.on("error", (err) => {
    console.error("🔌 SOCKET ERROR:", err);
  });

  // ─── Start Nova Sonic ──────────────────────────────────────────────────────
  socket.on("start-nova-sonic", async (config = {}) => {
    console.log("🚀 Starting Nova Sonic session for client:", socket.id);

    audioStarted = false;
    // Clear any lingering end-audio wait so the new session's mic input isn't silently dropped
    waitingForResponse = false;
    if (responseWaitTimeout) { clearTimeout(responseWaitTimeout); responseWaitTimeout = null; }

    // Kill any previous process
    if (novaProcess) {
      novaProcess.kill();
      novaProcess = null;
    }
    novaReady = false;
    diagnosisCompleted = false;

    // Get Cognito Identity Pool credentials for user-specific access
    console.log("🔑 Getting Cognito Identity Pool credentials for user:", socket.userEmail);
    let stsCredentials;
    try {
      stsCredentials = await getStsCredentials(socket.handshake.auth.token);
      console.log("✅ Successfully obtained Cognito Identity Pool credentials");
    } catch (error) {
      console.error("❌ Failed to get Cognito credentials:", error.message);
      socket.emit("nova-error", { error: "Failed to authenticate with AWS services" });
      return;
    }

    const PORT = process.env.PORT || 80;
    
    // Try python3 first, then python if that fails
    const pythonCmd = process.env.PYTHON_CMD || "python3";
    console.log(`🐍 PYTHON_CMD env var: ${process.env.PYTHON_CMD}`);
    console.log(`🐍 Using command: ${pythonCmd}`);
    console.log(`🐍 Attempting to spawn: ${pythonCmd} nova_sonic.py`);
    console.log(`🔊 VOICE_RUNTIME env: ${process.env.VOICE_RUNTIME || "(not set — defaults to polly in Python)"}`);
    console.log(`📋 Session config: session_id=${config.session_id}, voice_id=${config.voice_id}, patient_id=${config.patient_id}`);
    
    try {
      novaProcess = spawn(pythonCmd, ["nova_sonic.py"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          SESSION_ID: config.session_id || "default",
          VOICE_ID: config.voice_id || "",
          USER_ID: socket.userId || "anonymous",
          AWS_ACCESS_KEY_ID: stsCredentials.AccessKeyId,
          AWS_SECRET_ACCESS_KEY: stsCredentials.SecretKey,
          AWS_SESSION_TOKEN: stsCredentials.SessionToken,
          SM_DB_CREDENTIALS: process.env.SM_DB_CREDENTIALS || "",
          RDS_PROXY_ENDPOINT: process.env.RDS_PROXY_ENDPOINT || "",
          PATIENT_NAME: config.patient_name || "",
          PATIENT_PROMPT: config.patient_prompt || "",
          PATIENT_ID: config.patient_id || "",
          LLM_COMPLETION: config.llm_completion ? "true" : "false",
          EXTRA_SYSTEM_PROMPT: config.system_prompt || "",
          APPSYNC_GRAPHQL_URL: process.env.APPSYNC_GRAPHQL_URL || "",
          COGNITO_TOKEN: socket.handshake.auth.token || "",
        },
      });
      console.log("📡 Nova process spawned with PID:", novaProcess.pid);
    } catch (error) {
      console.error("❌ Failed to spawn Nova process:", error.message);
      socket.emit("nova-error", { error: "Failed to start voice system" });
      return;
    }

    // Capture stdout and stderr
    // Large JSON messages (audio chunks, ~40-80 KB base64) are split across
    // multiple stdout data events. Accumulate into a line buffer so each
    // complete newline-terminated JSON object is parsed atomically.
    let stdoutLineBuffer = "";
    const STDOUT_BUFFER_MAX = 10 * 1024 * 1024; // 10 MB — guard against OOM from malformed JSON

    novaProcess.stdout.on("data", (data) => {
      stdoutLineBuffer += data.toString();
      if (stdoutLineBuffer.length > STDOUT_BUFFER_MAX) {
        console.error(`⚠️ stdoutLineBuffer exceeded ${STDOUT_BUFFER_MAX / 1e6} MB — truncating to prevent OOM`);
        stdoutLineBuffer = stdoutLineBuffer.slice(-1024); // keep tail in case it's mid-line
      }
      const lines = stdoutLineBuffer.split("\n");
      // The last element is either empty or an incomplete line — keep it
      stdoutLineBuffer = lines.pop() ?? "";
      lines
        .filter(Boolean)
        .forEach((line) => {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type !== "audio") console.log("📤 NOVA JSON:", parsed);

            // ─ Audio chunks ───────────────────────────────────────────────
            if (parsed.type === "audio") {
              // First audio chunk from Python means the response is flowing —
              // re-enable audio input so barge-in works during playback.
              if (waitingForResponse) {
                waitingForResponse = false;
                if (responseWaitTimeout) { clearTimeout(responseWaitTimeout); responseWaitTimeout = null; }
                console.log("🔓 First audio chunk received — waitingForResponse cleared, barge-in enabled");
              }
              const b64Len = parsed.data?.length ?? 0;
              console.log(`🔊 AUDIO CHUNK from Python: gen=${parsed.generation_id ?? "?"}, seq=${parsed.chunk_seq ?? "?"}, b64_len=${b64Len}`);
              console.log(`🔊 Emitting audio-chunk to socket ${socket.id} (connected=${socket.connected})`);
              socket.emit("audio-chunk", { data: parsed.data });
              console.log(`🔊 audio-chunk emitted OK`);
            }
            // ─ Debug messages ───────────────────────────────────────────
            else if (parsed.type === "debug") {
              console.log("🐞 NOVA DEBUG:", parsed.text);
              socket.emit("nova-debug", { message: parsed.text, timestamp: Date.now() });
              // "Nova Sonic ready" may arrive as a debug message
              if (parsed.text && parsed.text.includes("Nova Sonic ready")) {
                novaReady = true;
                console.log("✅ NOVA SONIC READY (via debug event) — novaReady=true");
                socket.emit("nova-started", { status: "Nova Sonic session started" });
              }
            }
            // ─ Voice empathy evaluation results ──────────────────────────
            else if (parsed.type === "voice_empathy_result") {
              console.log("🎤 VOICE EMPATHY RESULT:", parsed.content?.substring(0, 100));
              socket.emit("voice-empathy-result", { content: parsed.content });
            }
            // ─ Text messages ─────────────────────────────────────────────
            else if (parsed.type === "text") {
              if (waitingForResponse) {
                waitingForResponse = false;
                if (responseWaitTimeout) { clearTimeout(responseWaitTimeout); responseWaitTimeout = null; }
                console.log("🔓 First text chunk received — waitingForResponse cleared");
              }
              console.log("💬 NOVA TEXT:", parsed.text);
              socket.emit("text-message", { text: parsed.text });
              if (parsed.text.includes("Nova Sonic ready")) {
                novaReady = true;
                console.log("✅ NOVA SONIC READY - Voice empathy evaluation enabled");
                socket.emit("nova-started", { status: "Nova Sonic session started" });
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
              if (!diagnosisCompleted) {
                diagnosisCompleted = true;
                socket.emit("diagnosis-complete", { message: parsed.text });
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
          } catch {
            // Plain‑text fallback
            console.log("[python]", line);
            if (line.includes("Nova Sonic ready")) {
              novaReady = true;
              socket.emit("nova-started", {
                status: "Nova Sonic session started",
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
            if (line.includes("SESSION COMPLETED") && !diagnosisCompleted) {
              diagnosisCompleted = true;
              socket.emit("diagnosis-complete", { message: "Session completed successfully" });
            }
          }
        });
    });

    novaProcess.stderr.on("data", (data) => {
      const stderrText = data.toString().trim();
      console.warn("⚠️ Nova stderr:", stderrText);
      
      // Forward important stderr messages to frontend for debugging
      if (stderrText.includes("EMPATHY") || stderrText.includes("🧠") || stderrText.includes("ERROR")) {
        socket.emit("nova-debug", { 
          type: "stderr", 
          message: stderrText,
          timestamp: Date.now()
        });
      }
    });

    novaProcess.on("error", (error) => {
      console.error("❌ Nova process error:", error.message);
      console.error("❌ Nova process error details:", error);
      
      // Send error details to frontend
      socket.emit("nova-error", { 
        error: error.message,
        code: error.code,
        details: error.toString()
      });
      
      if (error.code === "ENOENT") {
        console.log("🐍 Trying 'python' instead of 'python3'");
        // Retry with 'python' command
        try {
          novaProcess = spawn("python", ["nova_sonic.py"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
              ...process.env,
              SESSION_ID: config.session_id || "default",
              VOICE_ID: config.voice_id || "",
              USER_ID: socket.userId || "anonymous",
              AWS_ACCESS_KEY_ID: stsCredentials.AccessKeyId,
              AWS_SECRET_ACCESS_KEY: stsCredentials.SecretKey,
              AWS_SESSION_TOKEN: stsCredentials.SessionToken,
              SM_DB_CREDENTIALS: process.env.SM_DB_CREDENTIALS || "",
              RDS_PROXY_ENDPOINT: process.env.RDS_PROXY_ENDPOINT || "",
              PATIENT_NAME: config.patient_name || "",
              PATIENT_PROMPT: config.patient_prompt || "",
              PATIENT_ID: config.patient_id || "",
              LLM_COMPLETION: config.llm_completion ? "true" : "false",
              EXTRA_SYSTEM_PROMPT: config.system_prompt || "",
              APPSYNC_GRAPHQL_URL: process.env.APPSYNC_GRAPHQL_URL || "",
              COGNITO_TOKEN: socket.handshake.auth.token || "",
            },
          });
          console.log("📡 Nova process spawned with 'python', PID:", novaProcess.pid);
        } catch (retryError) {
          console.error("❌ Failed to spawn with 'python' too:", retryError.message);
          socket.emit("nova-error", { error: "Python not found" });
        }
      } else {
        socket.emit("nova-error", { error: error.message });
      }
    });

    novaProcess.on("close", (code) => {
      console.log("🔚 Nova process closed with code:", code);
      novaProcess = null;
      novaReady = false;
    });
  });

  // ─── Audio‑input from client ──────────────────────────────────────────────
  let audioStarted = false;
  // waitingForResponse: true between end-audio and the first audio/text response
  // chunk from Python. Prevents buffered audio-input packets (sent just before
  // the user stopped) from triggering a new start_audio that would cancel the
  // in-flight LLaMA/Polly reply via _interrupt_generation.
  let waitingForResponse = false;
  let responseWaitTimeout = null;

  socket.on("audio-input", (msg) => {
    if (waitingForResponse) {
      // Drain buffered packets silently — response is being generated
      return;
    }
    if (novaProcess && novaProcess.stdin.writable && novaReady) {
      if (!audioStarted) {
        novaProcess.stdin.write(JSON.stringify({ type: "start_audio" }) + "\n");
        audioStarted = true;
        console.log("🎬 Sent start_audio to Nova process");
      }
      novaProcess.stdin.write(
        JSON.stringify({ type: "audio", data: msg.data }) + "\n"
      );
    } else {
      console.log("❌ Cannot send audio - not ready or stdin closed");
    }
  });

  // ─── Text‑input from client ───────────────────────────────────────────────
  socket.on("text-input", (msg) => {
    if (novaProcess && novaProcess.stdin.writable && novaReady) {
      novaProcess.stdin.write(
        JSON.stringify({ type: "text", data: msg.text }) + "\n"
      );
      console.log("📝 Sent text to Nova process");
    }
  });

  // ─── Text generation streaming ─────────────────────────────────────────────
  socket.on("text-generation", async (data) => {
    console.log("🚀 Text generation request:", data);

    try {
      const response = await fetch(
        `${process.env.TEXT_GENERATION_ENDPOINT}/student/text_generation?simulation_group_id=${data.simulation_group_id}&session_id=${data.session_id}&patient_id=${data.patient_id}&session_name=${data.session_name}&stream=true`,
        {
          method: "POST",
          headers: {
            Authorization: data.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message_content: data.message }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              socket.emit("text-stream", eventData);
            } catch (e) {
              console.warn("Failed to parse SSE:", line);
            }
          }
        }
      }
    } catch (error) {
      console.error("Text generation error:", error);
      socket.emit("text-stream", {
        type: "error",
        content: "Failed to generate response",
      });
    }
  });

  // ─── End‑audio event ─────────────────────────────────────────────────────
  socket.on("end-audio", () => {
    console.log(`🛑 end-audio received — novaProcess=${!!novaProcess}, writable=${novaProcess?.stdin?.writable}, novaReady=${novaReady}`);
    if (novaProcess && novaProcess.stdin.writable && novaReady) {
      novaProcess.stdin.write(JSON.stringify({ type: "end_audio" }) + "\n");
      audioStarted = false;

      // Block new start_audio until Python sends back a response chunk.
      // This prevents trailing audio-input packets (sent just before the user
      // stopped) from triggering _interrupt_generation and cancelling the reply.
      waitingForResponse = true;
      if (responseWaitTimeout) clearTimeout(responseWaitTimeout);
      responseWaitTimeout = setTimeout(() => {
        console.log("⏱️ responseWait timeout — re-enabling audio input");
        waitingForResponse = false;
        responseWaitTimeout = null;
      }, 30000);

      console.log("🛑 Sent end_audio to Nova process, waitingForResponse=true");
    } else {
      console.log("⚠️ end-audio NOT forwarded — Nova not ready or process missing");
    }
  });

  // ─── Voice transcription for manual empathy evaluation ──────────────────
  socket.on("voice-transcription", (data) => {
    console.log("🎤 VOICE TRANSCRIPTION: Received for empathy evaluation:", data.text?.substring(0, 50));
    console.log("🎤 VOICE TRANSCRIPTION: Session ID:", data.session_id);
    console.log("🎤 VOICE TRANSCRIPTION: Nova ready:", novaReady);
    console.log("🎤 VOICE TRANSCRIPTION: Nova process exists:", !!novaProcess);
    console.log("🎤 VOICE TRANSCRIPTION: Stdin writable:", novaProcess?.stdin?.writable);
    
    if (novaProcess && novaProcess.stdin.writable && novaReady) {
      try {
        // Send transcription to Nova Sonic for empathy evaluation
        const message = {
          type: "evaluate_empathy",
          text: data.text,
          session_id: data.session_id || "default",
          empathy_tool: data.empathy_tool || undefined,
          simulation_group_id: data.simulation_group_id || undefined,
        };
        
        console.log("🎤 VOICE TRANSCRIPTION: Sending message to Nova:", JSON.stringify(message).substring(0, 100));
        novaProcess.stdin.write(JSON.stringify(message) + "\n");
        console.log("✅ VOICE TRANSCRIPTION: Successfully sent to Nova for empathy evaluation");
        
        // Also emit confirmation to frontend
        socket.emit("transcription-received", { 
          status: "processing", 
          text: data.text?.substring(0, 50) + "..."
        });
        
      } catch (error) {
        console.error("❌ VOICE TRANSCRIPTION: Error sending to Nova:", error);
        socket.emit("transcription-error", { error: error.message });
      }
    } else {
      console.log("❌ VOICE TRANSCRIPTION: Cannot send - Nova not ready or stdin not writable");
      console.log("   - Nova process:", !!novaProcess);
      console.log("   - Stdin writable:", novaProcess?.stdin?.writable);
      console.log("   - Nova ready:", novaReady);
      
      socket.emit("transcription-error", { 
        error: "Voice system not ready",
        details: {
          novaProcess: !!novaProcess,
          stdinWritable: novaProcess?.stdin?.writable,
          novaReady: novaReady
        }
      });
    }
  });



  // ─── Optional Stop event ────────────────────────────────────────────────
  socket.on("stop-nova-sonic", () => {
    console.log("🛑 Stop requested by client");
    if (novaProcess) {
      novaProcess.kill();
      novaProcess = null;
      novaReady = false;
    }
  });

  // ─── Do NOT kill on disconnect ──────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("🔌 CLIENT DISCONNECTED:", socket.id, "- Nova still running");
  });
});

// ─── Start HTTP server on port 80 ─────────────────────────────────────────
const PORT = process.env.PORT || 80;
server.listen(PORT, "0.0.0.0", () => {
  serverReady = true;
  const startupTime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ Socket server ready and listening on port ${PORT}`);
  console.log(`   Startup time: ${startupTime}s`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`${'='.repeat(70)}\n`);
  
  // Log environment readiness
  if (process.env.SM_DB_CREDENTIALS) {
    console.log(`✅ DB Credentials: LOADED`);
  } else {
    console.log(`⚠️  DB Credentials: NOT SET`);
  }
  
  if (process.env.RDS_PROXY_ENDPOINT) {
    console.log(`✅ RDS Proxy: ${process.env.RDS_PROXY_ENDPOINT}`);
  } else {
    console.log(`⚠️  RDS Proxy: NOT SET`);
  }
  
  if (process.env.APPSYNC_GRAPHQL_URL) {
    console.log(`✅ AppSync GraphQL: CONFIGURED`);
  } else {
    console.log(`⚠️  AppSync GraphQL: NOT SET`);
  }
  
  // Start a watchdog to log status every 30 seconds if running for debugging
  if (process.env.ENABLE_STATUS_LOGS === 'true') {
    setInterval(() => {
      const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
      const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(`📊 Status: Uptime=${uptime}s, Clients=${io.engine.clientsCount}, Memory=${memory}MB, HealthChecks=${healthCheckCount}`);
    }, 30000);
  }
});
