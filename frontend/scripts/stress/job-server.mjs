import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const host = process.env.STRESS_JOB_SERVER_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.STRESS_JOB_SERVER_PORT || "8787", 10);
const frontendRoot = process.cwd();

const jobs = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function allowedEnv(overrides = {}) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(overrides)) {
    if (!k.startsWith("STRESS_") && !k.startsWith("VITE_")) continue;
    env[k] = String(v ?? "");
  }
  return env;
}

function parseSummaryFromReport(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return null;
  try {
    const raw = fs.readFileSync(reportPath, "utf8");
    const report = JSON.parse(raw);
    return {
      kind: report.kind,
      startedAt: report.startedAt,
      endedAt: report.endedAt,
      durationMs: report.durationMs,
      totals: report.totals,
      phaseLatency: report.phaseLatency,
    };
  } catch {
    return null;
  }
}

function launchJob(mode, envOverrides = {}) {
  const script = mode === "voice" ? "./scripts/stress/voice-stress.mjs" : "./scripts/stress/text-stress.mjs";
  const id = randomUUID();
  const job = {
    id,
    mode,
    status: "running",
    createdAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    endedAt: null,
    exitCode: null,
    stdoutTail: [],
    stderrTail: [],
    reportPath: null,
    summary: null,
  };
  jobs.set(id, job);

  const child = spawn(process.execPath, [script], {
    cwd: frontendRoot,
    env: allowedEnv(envOverrides),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const pushTail = (arr, line) => {
    arr.push(line);
    if (arr.length > 80) arr.shift();
  };

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    text.split(/\r?\n/).filter(Boolean).forEach((line) => {
      pushTail(job.stdoutTail, line);
      const match = line.match(/^Report:\s*(.+)$/i);
      if (match) job.reportPath = match[1].trim();
    });
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    text.split(/\r?\n/).filter(Boolean).forEach((line) => pushTail(job.stderrTail, line));
  });

  child.on("close", (code) => {
    job.status = code === 0 ? "completed" : "failed";
    job.exitCode = code;
    job.endedAt = new Date().toISOString();
    job.summary = parseSummaryFromReport(job.reportPath);
  });

  child.on("error", (error) => {
    job.status = "failed";
    job.exitCode = -1;
    job.endedAt = new Date().toISOString();
    pushTail(job.stderrTail, error.message || String(error));
  });

  return job;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      serverTime: new Date().toISOString(),
      runningJobs: [...jobs.values()].filter((j) => j.status === "running").length,
      totalJobs: jobs.size,
    });
  }

  if (req.method === "POST" && url.pathname === "/jobs") {
    try {
      const body = await parseBody(req);
      const mode = body.mode === "voice" ? "voice" : "text";
      const job = launchJob(mode, body.env || {});
      return sendJson(res, 202, { jobId: job.id, status: job.status, mode: job.mode });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/jobs") {
    const list = [...jobs.values()]
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .slice(0, 30)
      .map((j) => ({
        id: j.id,
        mode: j.mode,
        status: j.status,
        createdAt: j.createdAt,
        endedAt: j.endedAt,
        exitCode: j.exitCode,
        summary: j.summary,
      }));
    return sendJson(res, 200, { jobs: list });
  }

  const match = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/i);
  if (req.method === "GET" && match) {
    const job = jobs.get(match[1]);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    return sendJson(res, 200, job);
  }

  return sendJson(res, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Stress job server listening at http://${host}:${port}`);
});
