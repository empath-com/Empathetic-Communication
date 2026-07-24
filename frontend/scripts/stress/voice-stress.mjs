import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import {
  envInt,
  loadCredentials,
  nowIso,
  sleep,
  summarizeLatency,
  writeRunArtifacts,
} from "./common.mjs";

const config = {
  socketUrl: process.env.STRESS_SOCKET_URL || process.env.VITE_SOCKET_URL,
  virtualUsers: envInt("STRESS_USERS", 50),
  turnsPerUser: envInt("STRESS_VOICE_TURNS", 2),
  rampMs: envInt("STRESS_RAMP_MS", 200),
  readyTimeoutMs: envInt("STRESS_VOICE_READY_TIMEOUT_MS", 30000),
  responseTimeoutMs: envInt("STRESS_VOICE_RESPONSE_TIMEOUT_MS", 30000),
  turnGapMs: envInt("STRESS_VOICE_TURN_GAP_MS", 800),
  inputMode: (process.env.STRESS_VOICE_INPUT_MODE || "text").toLowerCase(),
  voiceId: process.env.STRESS_VOICE_ID || "matthew",
  patientId: process.env.STRESS_PATIENT_ID || "",
  patientName: process.env.STRESS_PATIENT_NAME || "Stress Test Patient",
  patientPrompt: process.env.STRESS_PATIENT_PROMPT || "You are a patient in a stress test session.",
  llmCompletion: (process.env.STRESS_VOICE_LLM_COMPLETION || "false").toLowerCase() === "true",
};

if (!config.socketUrl) {
  throw new Error("STRESS_SOCKET_URL (or VITE_SOCKET_URL) is required");
}
if (!["text", "end-audio"].includes(config.inputMode)) {
  throw new Error("STRESS_VOICE_INPUT_MODE must be 'text' or 'end-audio'");
}

const credentials = loadCredentials();
const results = [];
const startedAt = Date.now();

function record(phase, data = {}) {
  results.push({ phase, startedAtMs: Date.now(), ...data });
}

function onceAny(socket, events, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for events: ${events.join(", ")}`));
    }, timeoutMs);

    const handlers = new Map();
    const cleanup = () => {
      clearTimeout(timer);
      for (const [event, handler] of handlers.entries()) {
        socket.off(event, handler);
      }
    };

    events.forEach((event) => {
      const handler = (payload) => {
        cleanup();
        resolve({ event, payload });
      };
      handlers.set(event, handler);
      socket.once(event, handler);
    });
  });
}

async function runTurn(socket, userIndex, turnIndex) {
  const start = Date.now();

  if (config.inputMode === "text") {
    socket.emit("text-input", {
      text: `Stress voice message user=${userIndex + 1} turn=${turnIndex + 1} ${randomUUID().slice(0, 8)}`,
    });
  } else {
    socket.emit("end-audio");
  }

  try {
    const firstResponse = await onceAny(
      socket,
      ["audio-chunk", "text-message", "voice-empathy-result", "nova-error", "disconnect"],
      config.responseTimeoutMs
    );

    const ok = !["nova-error", "disconnect"].includes(firstResponse.event);
    record("voice_turn", {
      ok,
      userIndex,
      turnIndex,
      latencyMs: Date.now() - start,
      firstEvent: firstResponse.event,
    });
  } catch (error) {
    record("voice_turn", {
      ok: false,
      userIndex,
      turnIndex,
      latencyMs: Date.now() - start,
      error: error.message,
    });
  }
}

async function runVirtualUser(userIndex) {
  await sleep(userIndex * config.rampMs);

  const credential = credentials[userIndex % credentials.length];
  const sessionId = `stress-voice-${userIndex + 1}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const connectStart = Date.now();

  const socket = io(config.socketUrl, {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
    auth: { token: credential.token },
    timeout: config.readyTimeoutMs,
  });

  socket.on("connect_error", (error) => {
    record("connect_error", {
      ok: false,
      userIndex,
      error: error?.message || String(error),
    });
  });

  socket.connect();

  try {
    await onceAny(socket, ["connect"], config.readyTimeoutMs);
    record("socket_connect", {
      ok: true,
      userIndex,
      latencyMs: Date.now() - connectStart,
    });

    const readyStart = Date.now();
    socket.emit("start-voice-session", {
      voice_id: config.voiceId,
      session_id: sessionId,
      patient_name: config.patientName,
      patient_prompt: config.patientPrompt,
      patient_id: config.patientId,
      llm_completion: config.llmCompletion,
    });

    await onceAny(socket, ["voice-started", "nova-started"], config.readyTimeoutMs);
    record("voice_ready", {
      ok: true,
      userIndex,
      latencyMs: Date.now() - readyStart,
    });

    for (let turnIndex = 0; turnIndex < config.turnsPerUser; turnIndex += 1) {
      await runTurn(socket, userIndex, turnIndex);
      await sleep(config.turnGapMs);
    }
  } catch (error) {
    record("voice_session", {
      ok: false,
      userIndex,
      error: error.message,
    });
  } finally {
    socket.disconnect();
  }
}

console.log(`[${nowIso()}] Starting voice stress run`);
console.log(JSON.stringify(config, null, 2));
console.log(`Credentials loaded: ${credentials.length}`);

await Promise.all(Array.from({ length: config.virtualUsers }, (_, i) => runVirtualUser(i)));

const endedAt = Date.now();
const failures = results.filter((r) => r.ok === false).length;

const report = {
  kind: "voice-stress",
  startedAt: new Date(startedAt).toISOString(),
  endedAt: new Date(endedAt).toISOString(),
  durationMs: endedAt - startedAt,
  config,
  credentialsUsed: credentials.length,
  totals: {
    events: results.length,
    failures,
    failureRate: results.length ? Number(((failures / results.length) * 100).toFixed(2)) : 0,
  },
  phaseLatency: [
    summarizeLatency(results, "socket_connect"),
    summarizeLatency(results, "voice_ready"),
    summarizeLatency(results, "voice_turn"),
  ],
  failures: results.filter((r) => r.ok === false).slice(0, 200),
};

const artifacts = writeRunArtifacts("voice-stress", report, results);
console.log("\nVoice stress test complete");
console.table(report.phaseLatency);
console.log(`Total recorded events: ${report.totals.events}`);
console.log(`Failure rate: ${report.totals.failureRate}%`);
console.log(`Report: ${artifacts.jsonPath}`);
console.log(`Latency CSV: ${artifacts.latencyCsvPath}`);
console.log(`Throughput CSV: ${artifacts.throughputCsvPath}`);
console.log(`Throughput chart markdown: ${artifacts.throughputChartPath}`);
