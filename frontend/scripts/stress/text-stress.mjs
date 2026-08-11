import { randomUUID } from "node:crypto";
import {
  envBool,
  envInt,
  fetchJson,
  loadCredentials,
  normalizeApiBase,
  nowIso,
  sleep,
  summarizeLatency,
  writeRunArtifacts,
} from "./common.mjs";

const config = {
  apiBase: normalizeApiBase(process.env.STRESS_API_ENDPOINT || process.env.VITE_API_ENDPOINT),
  simulationGroupId: process.env.STRESS_SIMULATION_GROUP_ID,
  patientId: process.env.STRESS_PATIENT_ID,
  virtualUsers: envInt("STRESS_USERS", 50),
  messagesPerUser: envInt("STRESS_MESSAGES_PER_USER", 3),
  rampMs: envInt("STRESS_RAMP_MS", 150),
  stream: envBool("STRESS_TEXT_STREAM", false),
  timeoutMs: envInt("STRESS_REQUEST_TIMEOUT_MS", 90000),
  sessionPrefix: process.env.STRESS_SESSION_PREFIX || "Stress",
};

if (!config.simulationGroupId || !config.patientId) {
  throw new Error("STRESS_SIMULATION_GROUP_ID and STRESS_PATIENT_ID are required");
}

const credentials = loadCredentials();
if (credentials.some((c) => !c.email)) {
  throw new Error("Each credential must have an email claim or explicit email property");
}

const results = [];
const startedAt = Date.now();

function extractFailureReason(response) {
  const data = response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    return (
      data.error ||
      data.message ||
      data.details ||
      data.raw ||
      null
    );
  }
  return null;
}

function buildStudentUrl(path, queryParams) {
  const url = new URL(`student/${path}`, config.apiBase);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value == null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function timedCall(phase, fn, metadata) {
  const start = Date.now();
  try {
    const response = await fn();
    const latencyMs = Date.now() - start;
    const ok = !!response?.ok;
    const failureReason = ok ? null : extractFailureReason(response);
    results.push({
      phase,
      ok,
      latencyMs,
      status: response?.status ?? null,
      statusText: response?.statusText ?? null,
      requestId: response?.responseHeaders?.requestId ?? null,
      error: ok ? null : failureReason || "HTTP request failed",
      responsePreview: ok ? null : response?.rawText || null,
      startedAtMs: start,
      ...metadata,
    });
    return response;
  } catch (error) {
    const latencyMs = Date.now() - start;
    results.push({
      phase,
      ok: false,
      latencyMs,
      status: null,
      statusText: null,
      requestId: null,
      startedAtMs: start,
      error: error?.message || String(error),
      errorType: error?.name || "Error",
      ...metadata,
    });
    return null;
  }
}

async function createSession(credential, userIndex) {
  const sessionName = `${config.sessionPrefix}-${userIndex + 1}`;
  const url = buildStudentUrl("create_session", {
    email: credential.email,
    simulation_group_id: config.simulationGroupId,
    patient_id: config.patientId,
    session_name: sessionName,
  });

  const response = await timedCall(
    "create_session",
    () =>
      fetchJson(url, {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: {
          Authorization: credential.token,
          "Content-Type": "application/json",
        },
      }),
    { userIndex }
  );

  if (!response?.ok || !Array.isArray(response.data) || !response.data[0]?.session_id) {
    return null;
  }

  return {
    sessionId: response.data[0].session_id,
    sessionName,
  };
}

async function createMessage(credential, sessionId, text, userIndex, turnIndex) {
  const url = buildStudentUrl("create_message", {
    session_id: sessionId,
    email: credential.email,
    simulation_group_id: config.simulationGroupId,
    patient_id: config.patientId,
  });

  const response = await timedCall(
    "create_message",
    () =>
      fetchJson(url, {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: {
          Authorization: credential.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message_content: text }),
      }),
    { userIndex, turnIndex }
  );

  if (!response?.ok || !Array.isArray(response.data) || !response.data[0]?.message_id) {
    return null;
  }

  return response.data[0].message_id;
}

async function requestTextGeneration(credential, sessionData, text, messageId, userIndex, turnIndex) {
  const url = buildStudentUrl("text_generation", {
    simulation_group_id: config.simulationGroupId,
    session_id: sessionData.sessionId,
    patient_id: config.patientId,
    session_name: sessionData.sessionName,
    message_id: messageId,
    stream: config.stream ? "true" : "false",
  });

  return timedCall(
    "text_generation",
    () =>
      fetchJson(url, {
        method: "POST",
        timeoutMs: config.timeoutMs,
        headers: {
          Authorization: credential.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message_content: text }),
      }),
    { userIndex, turnIndex }
  );
}

async function runVirtualUser(userIndex) {
  await sleep(userIndex * config.rampMs);

  const credential = credentials[userIndex % credentials.length];
  const sessionData = await createSession(credential, userIndex);
  if (!sessionData) return;

  for (let turnIndex = 0; turnIndex < config.messagesPerUser; turnIndex += 1) {
    const message = `Stress message user=${userIndex + 1} turn=${turnIndex + 1} run=${randomUUID().slice(0, 8)}`;
    const messageId = await createMessage(credential, sessionData.sessionId, message, userIndex, turnIndex);
    if (!messageId) continue;
    await requestTextGeneration(credential, sessionData, message, messageId, userIndex, turnIndex);
  }
}

console.log(`[${nowIso()}] Starting text stress run`);
console.log(JSON.stringify(config, null, 2));
console.log(`Credentials loaded: ${credentials.length}`);

await Promise.all(Array.from({ length: config.virtualUsers }, (_, i) => runVirtualUser(i)));

const endedAt = Date.now();
const failures = results.filter((r) => !r.ok).length;
const report = {
  kind: "text-stress",
  startedAt: new Date(startedAt).toISOString(),
  endedAt: new Date(endedAt).toISOString(),
  durationMs: endedAt - startedAt,
  config,
  credentialsUsed: credentials.length,
  totals: {
    requests: results.length,
    failures,
    failureRate: results.length ? Number(((failures / results.length) * 100).toFixed(2)) : 0,
  },
  phaseLatency: [
    summarizeLatency(results, "create_session"),
    summarizeLatency(results, "create_message"),
    summarizeLatency(results, "text_generation"),
  ],
  failures: results.filter((r) => !r.ok).slice(0, 200),
};

const artifacts = writeRunArtifacts("text-stress", report, results);
console.log("\nText stress test complete");
console.table(report.phaseLatency);
console.log(`Total requests: ${report.totals.requests}`);
console.log(`Failure rate: ${report.totals.failureRate}%`);
console.log(`Report: ${artifacts.jsonPath}`);
console.log(`Latency CSV: ${artifacts.latencyCsvPath}`);
console.log(`Throughput CSV: ${artifacts.throughputCsvPath}`);
console.log(`Throughput chart markdown: ${artifacts.throughputChartPath}`);
