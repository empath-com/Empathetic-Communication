const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { verifyToken, getStsCredentials } = require("./auth");
const { processNovaOutput, processNovaPlainTextLine } = require("./novaOutputProcessor");
const { createLogger } = require("./logger");

const app = express();
const server = createServer(app);
const logger = createLogger({ service: "socket-server", component: "runtime", role: "socket" });

const corsOrigin = process.env.CORS_ALLOWED_ORIGIN || "*";
logger.info("Socket CORS configured", {
  event: "socket_cors_configured",
  corsOrigin,
});

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

const SERVER_START_TIME = Date.now();
let serverReady = false;
let lastHealthCheckTime = Date.now();
let healthCheckCount = 0;
let totalConnections = 0;

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
  logger.debug("Socket health check", {
    event: "socket_health_check",
    route: "GET /health",
    requestId: req.headers["x-request-id"] || null,
    activeClients: io.engine.clientsCount,
    uptimeSeconds: uptime,
  });
  res.json(metrics);
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const decoded = await verifyToken(token);
    socket.userId = decoded.sub;
    socket.userEmail = decoded.email;
    logger.info("Socket user authenticated", {
      event: "socket_auth_success",
      route: "socket_auth",
      userEmail: socket.userEmail,
      socketId: socket.id,
      requestId: socket.handshake.auth?.requestId || null,
    });
    next();
  } catch (err) {
    logger.error(
      "Socket authentication failed",
      {
        event: "socket_auth_failure",
        route: "socket_auth",
        socketId: socket.id,
      },
      err
    );
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  const requestId = socket.handshake.auth?.requestId || randomUUID();
  socket.data.requestId = requestId;
  totalConnections++;
  const socketLogger = logger.child({
    socketId: socket.id,
    requestId,
    userEmail: socket.userEmail || null,
    route: "socket_connection",
  });

  socketLogger.info("Socket client connected", {
    event: "socket_connected",
    activeClients: io.engine.clientsCount,
    totalConnections,
  });

  if (process.env.SM_DB_CREDENTIALS) {
    socketLogger.info("Socket DB credentials loaded", {
      event: "db_credentials_loaded",
      route: "socket_connection",
    });
  } else {
    socketLogger.error("Socket DB credentials missing", {
      event: "db_connection_error",
      route: "socket_connection",
      errorCode: "MISSING_DB_CREDENTIALS",
    });
  }

  if (process.env.RDS_PROXY_ENDPOINT) {
    socketLogger.info("Socket RDS proxy configured", {
      event: "db_proxy_configured",
      route: "socket_connection",
      rdsProxyEndpoint: process.env.RDS_PROXY_ENDPOINT,
    });
  } else {
    socketLogger.error("Socket RDS proxy missing", {
      event: "db_connection_error",
      route: "socket_connection",
      errorCode: "MISSING_RDS_PROXY_ENDPOINT",
    });
  }

  let novaProcess = null;
  let novaReady = false;
  let diagnosisCompleted = false;

  setTimeout(() => {
    socketLogger.debug("Socket active client snapshot", {
      event: "socket_active_clients_snapshot",
      route: "socket_connection",
      activeClients: io.engine.clientsCount,
    });
  }, 100);

  socket.on("error", (err) => {
    socketLogger.error("Socket error", {
      event: "socket_error",
      route: "socket_connection",
    }, err);
  });

  const startVoiceSession = async (config = {}) => {
    socketLogger.info("Starting Nova voice session", {
      event: "voice_session_start",
      route: "start_voice_session",
      sessionId: config.session_id || null,
      patientId: config.patient_id || null,
    });

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
    socketLogger.debug("Requesting STS credentials", {
      event: "socket_sts_credentials_requested",
      route: "start_voice_session",
      sessionId: config.session_id || null,
    });
    let stsCredentials;
    try {
      stsCredentials = await getStsCredentials(socket.handshake.auth.token);
      socketLogger.info("STS credentials acquired", {
        event: "socket_sts_credentials_acquired",
        route: "start_voice_session",
        sessionId: config.session_id || null,
      });
    } catch (error) {
      socketLogger.error("Failed to get STS credentials", {
        event: "socket_sts_credentials_error",
        route: "start_voice_session",
        sessionId: config.session_id || null,
      }, error);
      socket.emit("nova-error", { error: "Failed to authenticate with AWS services" });
      return;
    }

    const PORT = process.env.PORT || 80;
    
    // Try python3 first, then python if that fails
    const pythonCmd = process.env.PYTHON_CMD || "python3";
    socketLogger.debug("Preparing Nova process spawn", {
      event: "nova_process_spawn_prepare",
      route: "start_voice_session",
      sessionId: config.session_id || null,
      patientId: config.patient_id || null,
      voiceId: config.voice_id || null,
      pythonCmd,
      voiceRuntime: process.env.VOICE_RUNTIME || "polly",
    });
    
    try {
      novaProcess = spawn(pythonCmd, ["voice_runtime.py"], {
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
      socketLogger.info("Nova process spawned", {
        event: "nova_process_spawned",
        route: "start_voice_session",
        sessionId: config.session_id || null,
        pid: novaProcess.pid,
      });
    } catch (error) {
      socketLogger.error("Failed to spawn Nova process", {
        event: "nova_process_spawn_error",
        route: "start_voice_session",
        sessionId: config.session_id || null,
      }, error);
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
        socketLogger.warn("Nova stdout buffer exceeded safety threshold", {
          event: "nova_stdout_buffer_limit",
          route: "nova_stdout",
          sessionId: config.session_id || null,
          maxBytes: STDOUT_BUFFER_MAX,
        });
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
            if (parsed.type !== "audio") {
              socketLogger.debug("Nova JSON output", {
                event: "nova_json_output",
                route: "nova_stdout",
                sessionId: config.session_id || null,
                novaType: parsed.type,
              });
            }
            processNovaOutput(parsed, socket, {
              novaReady,
              setNovaReady: (value) => { novaReady = value; },
              diagnosisCompleted,
              setDiagnosisCompleted: (value) => { diagnosisCompleted = value; },
              waitingForResponse,
              setWaitingForResponse: (value) => { waitingForResponse = value; },
              responseWaitTimeout,
              clearResponseWaitTimeout: () => {
                if (responseWaitTimeout) {
                  clearTimeout(responseWaitTimeout);
                  responseWaitTimeout = null;
                }
              },
            }, socketLogger);
          } catch {
            processNovaPlainTextLine(line, socket, {
              setNovaReady: (value) => { novaReady = value; },
              diagnosisCompleted,
              setDiagnosisCompleted: (value) => { diagnosisCompleted = value; },
            }, socketLogger);
          }
        });
    });

    novaProcess.stderr.on("data", (data) => {
      const stderrText = data.toString().trim();
      socketLogger.warn("Nova stderr output", {
        event: "nova_stderr",
        route: "nova_stderr",
        sessionId: config.session_id || null,
        stderr: stderrText,
      });
      
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
      socketLogger.error("Nova process error", {
        event: "nova_process_error",
        route: "nova_process",
        sessionId: config.session_id || null,
      }, error);
      
      // Send error details to frontend
      socket.emit("nova-error", { 
        error: error.message,
        code: error.code,
        details: error.toString()
      });
      
      if (error.code === "ENOENT") {
        socketLogger.warn("Python3 unavailable; retrying with python", {
          event: "nova_python_retry",
          route: "nova_process",
          sessionId: config.session_id || null,
        });
        // Retry with 'python' command
        try {
          novaProcess = spawn("python", ["voice_runtime.py"], {
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
          socketLogger.info("Nova process spawned with python fallback", {
            event: "nova_process_spawned_fallback",
            route: "nova_process",
            sessionId: config.session_id || null,
            pid: novaProcess.pid,
          });
        } catch (retryError) {
          socketLogger.error("Nova python fallback spawn failed", {
            event: "nova_process_spawn_error_fallback",
            route: "nova_process",
            sessionId: config.session_id || null,
          }, retryError);
          socket.emit("nova-error", { error: "Python not found" });
        }
      } else {
        socket.emit("nova-error", { error: error.message });
      }
    });

    novaProcess.on("close", (code) => {
      socketLogger.info("Nova process closed", {
        event: "nova_process_closed",
        route: "nova_process",
        sessionId: config.session_id || null,
        exitCode: code,
      });
      novaProcess = null;
      novaReady = false;
    });
  };
  socket.on("start-voice-session", startVoiceSession);
  socket.on("start-nova-sonic", startVoiceSession);

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
        socketLogger.debug("Sent start_audio to Nova", {
          event: "nova_start_audio_sent",
          route: "audio_input",
        });
      }
      novaProcess.stdin.write(
        JSON.stringify({ type: "audio", data: msg.data }) + "\n"
      );
    } else {
      socketLogger.warn("Audio input dropped because Nova is not ready", {
        event: "audio_input_dropped",
        route: "audio_input",
        novaReady,
        hasNovaProcess: Boolean(novaProcess),
        stdinWritable: Boolean(novaProcess?.stdin?.writable),
      });
    }
  });

  // ─── Text‑input from client ───────────────────────────────────────────────
  socket.on("text-input", (msg) => {
    if (novaProcess && novaProcess.stdin.writable && novaReady) {
      novaProcess.stdin.write(
        JSON.stringify({ type: "text", data: msg.text }) + "\n"
      );
      socketLogger.debug("Sent text to Nova", {
        event: "nova_text_sent",
        route: "text_input",
      });
    }
  });

  // ─── Text generation streaming ─────────────────────────────────────────────
  socket.on("text-generation", async (data) => {
    socketLogger.info("Text generation stream start", {
      event: "text_generation_stream_start",
      route: "socket_text_generation",
      sessionId: data.session_id || null,
    });

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
              socketLogger.warn("Failed to parse SSE line", {
                event: "text_generation_sse_parse_error",
                route: "socket_text_generation",
                sessionId: data.session_id || null,
              });
            }
          }
        }
      }
    } catch (error) {
      socketLogger.error("Text generation stream error", {
        event: "text_generation_stream_error",
        route: "socket_text_generation",
        sessionId: data.session_id || null,
      }, error);
      socket.emit("text-stream", {
        type: "error",
        content: "Failed to generate response",
      });
    }
  });

  // ─── End‑audio event ─────────────────────────────────────────────────────
  socket.on("end-audio", () => {
    socketLogger.debug("Received end-audio", {
      event: "end_audio_received",
      route: "end_audio",
      hasNovaProcess: Boolean(novaProcess),
      stdinWritable: Boolean(novaProcess?.stdin?.writable),
      novaReady,
    });
    if (novaProcess && novaProcess.stdin.writable && novaReady) {
      novaProcess.stdin.write(JSON.stringify({ type: "end_audio" }) + "\n");
      audioStarted = false;

      // Block new start_audio until Python sends back a response chunk.
      // This prevents trailing audio-input packets (sent just before the user
      // stopped) from triggering _interrupt_generation and cancelling the reply.
      waitingForResponse = true;
      if (responseWaitTimeout) clearTimeout(responseWaitTimeout);
      responseWaitTimeout = setTimeout(() => {
        socketLogger.warn("Response wait timeout reached; re-enabling audio", {
          event: "end_audio_response_wait_timeout",
          route: "end_audio",
        });
        waitingForResponse = false;
        responseWaitTimeout = null;
      }, 30000);

      socketLogger.info("Forwarded end-audio to Nova", {
        event: "end_audio_forwarded",
        route: "end_audio",
      });
    } else {
      socketLogger.warn("End-audio not forwarded; Nova not ready", {
        event: "end_audio_dropped",
        route: "end_audio",
        hasNovaProcess: Boolean(novaProcess),
        stdinWritable: Boolean(novaProcess?.stdin?.writable),
        novaReady,
      });
    }
  });

  // ─── Voice transcription for manual empathy evaluation ──────────────────
  socket.on("voice-transcription", (data) => {
    socketLogger.info("Voice transcription received", {
      event: "voice_transcription_received",
      route: "voice_transcription",
      sessionId: data.session_id || null,
      preview: data.text?.substring(0, 50) || "",
      novaReady,
      hasNovaProcess: Boolean(novaProcess),
      stdinWritable: Boolean(novaProcess?.stdin?.writable),
    });
    
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
        
        socketLogger.debug("Forwarding transcription to Nova", {
          event: "voice_transcription_forwarded",
          route: "voice_transcription",
          sessionId: data.session_id || null,
        });
        novaProcess.stdin.write(JSON.stringify(message) + "\n");
        socketLogger.info("Voice transcription forwarded successfully", {
          event: "voice_transcription_forward_success",
          route: "voice_transcription",
          sessionId: data.session_id || null,
        });
        
        // Also emit confirmation to frontend
        socket.emit("transcription-received", { 
          status: "processing", 
          text: data.text?.substring(0, 50) + "..."
        });
        
      } catch (error) {
        socketLogger.error("Voice transcription forwarding failed", {
          event: "voice_transcription_forward_error",
          route: "voice_transcription",
          sessionId: data.session_id || null,
        }, error);
        socket.emit("transcription-error", { error: error.message });
      }
    } else {
      socketLogger.warn("Voice transcription dropped; Nova unavailable", {
        event: "voice_transcription_dropped",
        route: "voice_transcription",
        sessionId: data.session_id || null,
        hasNovaProcess: Boolean(novaProcess),
        stdinWritable: Boolean(novaProcess?.stdin?.writable),
        novaReady,
      });
      
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
    socketLogger.info("Stop Nova requested by client", {
      event: "nova_stop_requested",
      route: "stop_nova",
    });
    if (novaProcess) {
      novaProcess.kill();
      novaProcess = null;
      novaReady = false;
    }
  });

  // ─── Do NOT kill on disconnect ──────────────────────────────────────────
  socket.on("disconnect", () => {
    socketLogger.warn("Socket client disconnected", {
      event: "socket_disconnected",
      route: "socket_connection",
      sessionId: null,
      activeClients: io.engine.clientsCount,
    });
  });
});

// ─── Start HTTP server on port 80 ─────────────────────────────────────────
const PORT = process.env.PORT || 80;
server.listen(PORT, "0.0.0.0", () => {
  serverReady = true;
  const startupTime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  logger.info("Socket server ready", {
    event: "socket_server_ready",
    route: "server_startup",
    port: Number(PORT),
    startupTimeSeconds: startupTime,
    environment: process.env.NODE_ENV || "development",
  });
  
  // Log environment readiness
  if (process.env.SM_DB_CREDENTIALS) {
    logger.info("Socket startup DB credentials loaded", {
      event: "db_credentials_loaded",
      route: "server_startup",
    });
  } else {
    logger.error("Socket startup DB credentials missing", {
      event: "db_connection_error",
      route: "server_startup",
      errorCode: "MISSING_DB_CREDENTIALS",
    });
  }
  
  if (process.env.RDS_PROXY_ENDPOINT) {
    logger.info("Socket startup RDS proxy configured", {
      event: "db_proxy_configured",
      route: "server_startup",
      rdsProxyEndpoint: process.env.RDS_PROXY_ENDPOINT,
    });
  } else {
    logger.error("Socket startup RDS proxy missing", {
      event: "db_connection_error",
      route: "server_startup",
      errorCode: "MISSING_RDS_PROXY_ENDPOINT",
    });
  }
  
  if (process.env.APPSYNC_GRAPHQL_URL) {
    logger.info("Socket startup AppSync configured", {
      event: "appsync_configured",
      route: "server_startup",
    });
  } else {
    logger.warn("Socket startup AppSync not set", {
      event: "appsync_missing",
      route: "server_startup",
    });
  }
  
  // Start a watchdog to log status every 30 seconds if running for debugging
  if (process.env.ENABLE_STATUS_LOGS === 'true') {
    setInterval(() => {
      const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
      const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      logger.info("Socket periodic status", {
        event: "socket_periodic_status",
        route: "server_status",
        uptimeSeconds: uptime,
        activeClients: io.engine.clientsCount,
        memoryMb: memory,
        healthChecks: healthCheckCount,
      });
    }, 30000);
  }
});
