import fs from "node:fs";
import path from "node:path";

export const nowIso = () => new Date().toISOString();

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function envInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

export function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function normalizeApiBase(url) {
  if (!url) throw new Error("STRESS_API_ENDPOINT is required");
  return url.endsWith("/") ? url : `${url}/`;
}

export function parseJwtWithoutVerify(token) {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWT format");
  }
  const payload = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
  const json = Buffer.from(payload, "base64").toString("utf8");
  return JSON.parse(json);
}

export function loadCredentials() {
  const tokensFile = process.env.STRESS_TOKENS_FILE;
  if (tokensFile) {
    const fullPath = path.resolve(tokensFile);
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("STRESS_TOKENS_FILE must contain a non-empty JSON array");
    }
    return parsed.map((entry, idx) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`Credential at index ${idx} is not an object`);
      }
      if (!entry.token) {
        throw new Error(`Credential at index ${idx} is missing token`);
      }
      const payload = parseJwtWithoutVerify(entry.token);
      return {
        token: entry.token,
        email: entry.email || payload.email,
        username: entry.username || payload["cognito:username"] || payload.sub,
      };
    });
  }

  const singleToken = process.env.STRESS_ID_TOKEN;
  if (!singleToken) {
    throw new Error(
      "Provide STRESS_ID_TOKEN or STRESS_TOKENS_FILE (JSON array of token/email entries)."
    );
  }

  const payload = parseJwtWithoutVerify(singleToken);
  const email = process.env.STRESS_USER_EMAIL || payload.email;
  return [
    {
      token: singleToken,
      email,
      username: payload["cognito:username"] || payload.sub,
    },
  ];
}

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

export function summarizeLatency(results, phase) {
  const filtered = results.filter((r) => r.phase === phase && r.ok && Number.isFinite(r.latencyMs));
  const values = filtered.map((r) => r.latencyMs);
  if (values.length === 0) {
    return {
      phase,
      count: 0,
      p50: null,
      p95: null,
      p99: null,
      avg: null,
    };
  }

  const sum = values.reduce((acc, n) => acc + n, 0);
  return {
    phase,
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    avg: Number((sum / values.length).toFixed(1)),
  };
}

export function writeReport(reportName, report) {
  const outDir = path.resolve("stress-reports");
  fs.mkdirSync(outDir, { recursive: true });

  const safeName = reportName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const filename = `${safeName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const fullPath = path.join(outDir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(report, null, 2), "utf8");
  return fullPath;
}

export function toCsv(rows, columns) {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const raw = row[col];
        const value = raw == null ? "" : String(raw);
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export function buildThroughputBuckets(results) {
  const phaseMap = new Map();

  for (const result of results) {
    if (!Number.isFinite(result.startedAtMs)) continue;
    const second = Math.floor(result.startedAtMs / 1000) * 1000;
    if (!phaseMap.has(result.phase)) phaseMap.set(result.phase, new Map());
    const bucketMap = phaseMap.get(result.phase);
    bucketMap.set(second, (bucketMap.get(second) || 0) + 1);
  }

  const rows = [];
  for (const [phase, bucketMap] of phaseMap.entries()) {
    const sorted = [...bucketMap.entries()].sort((a, b) => a[0] - b[0]);
    for (const [secondMs, requests] of sorted) {
      rows.push({
        phase,
        second_iso: new Date(secondMs).toISOString(),
        requests,
      });
    }
  }

  return rows;
}

export function buildThroughputMarkdown(title, throughputRows) {
  const grouped = new Map();
  for (const row of throughputRows) {
    if (!grouped.has(row.phase)) grouped.set(row.phase, []);
    grouped.get(row.phase).push(row);
  }

  const sections = [`# ${title}`, "", "## Throughput Buckets (requests/sec)", ""];

  for (const [phase, rows] of grouped.entries()) {
    const x = rows.map((r) => r.second_iso.slice(11, 19));
    const y = rows.map((r) => r.requests);
    sections.push(`### ${phase}`);
    sections.push("");
    sections.push("```mermaid");
    sections.push("xychart-beta");
    sections.push(`    title \"${phase} requests per second\"`);
    sections.push(`    x-axis [${x.map((v) => `\"${v}\"`).join(", ")}]`);
    sections.push('    y-axis "requests" 0 --> ' + Math.max(1, ...y));
    sections.push(`    line [${y.join(", ")}]`);
    sections.push("```");
    sections.push("");
  }

  if (throughputRows.length === 0) {
    sections.push("No throughput buckets were recorded.");
    sections.push("");
  }

  return sections.join("\n");
}

export function writeRunArtifacts(reportName, report, results) {
  const jsonPath = writeReport(reportName, report);
  const basePath = jsonPath.replace(/\.json$/i, "");

  const latencyColumns = ["phase", "ok", "latencyMs", "status", "startedAt", "userIndex", "turnIndex", "firstEvent", "error"];
  const latencyRows = results.map((r) => ({
    phase: r.phase,
    ok: r.ok,
    latencyMs: r.latencyMs,
    status: r.status,
    startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : "",
    userIndex: r.userIndex,
    turnIndex: r.turnIndex,
    firstEvent: r.firstEvent,
    error: r.error,
  }));
  fs.writeFileSync(`${basePath}-latency.csv`, toCsv(latencyRows, latencyColumns), "utf8");

  const throughputRows = buildThroughputBuckets(results);
  fs.writeFileSync(
    `${basePath}-throughput.csv`,
    toCsv(throughputRows, ["phase", "second_iso", "requests"]),
    "utf8"
  );
  fs.writeFileSync(
    `${basePath}-throughput.md`,
    buildThroughputMarkdown(`${report.kind} throughput`, throughputRows),
    "utf8"
  );

  return {
    jsonPath,
    latencyCsvPath: `${basePath}-latency.csv`,
    throughputCsvPath: `${basePath}-throughput.csv`,
    throughputChartPath: `${basePath}-throughput.md`,
  };
}

export async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } finally {
    clearTimeout(timeout);
  }
}
