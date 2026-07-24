import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";

const defaultConfig = {
  STRESS_JOB_ENDPOINT: import.meta.env.VITE_STRESS_JOB_ENDPOINT || "http://127.0.0.1:8787",
  STRESS_API_ENDPOINT: import.meta.env.VITE_API_ENDPOINT || "",
  STRESS_SOCKET_URL: import.meta.env.VITE_SOCKET_URL || "",
  STRESS_SIMULATION_GROUP_ID: "",
  STRESS_PATIENT_ID: "",
  STRESS_USERS: "50",
  STRESS_MESSAGES_PER_USER: "3",
  STRESS_VOICE_TURNS: "2",
};

const statusColor = {
  running: "warning",
  completed: "success",
  failed: "error",
};

const toEnvPayload = (config, mode) => {
  const payload = {
    STRESS_API_ENDPOINT: config.STRESS_API_ENDPOINT,
    STRESS_SOCKET_URL: config.STRESS_SOCKET_URL,
    STRESS_SIMULATION_GROUP_ID: config.STRESS_SIMULATION_GROUP_ID,
    STRESS_PATIENT_ID: config.STRESS_PATIENT_ID,
    STRESS_USERS: config.STRESS_USERS,
  };

  if (mode === "text") {
    payload.STRESS_MESSAGES_PER_USER = config.STRESS_MESSAGES_PER_USER;
  }
  if (mode === "voice") {
    payload.STRESS_VOICE_TURNS = config.STRESS_VOICE_TURNS;
  }

  return payload;
};

const AdminStressTesting = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const endpointBase = useMemo(() => config.STRESS_JOB_ENDPOINT.replace(/\/$/, ""), [config.STRESS_JOB_ENDPOINT]);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch(`${endpointBase}/jobs`);
      if (!response.ok) throw new Error(`Failed to fetch jobs (${response.status})`);
      const data = await response.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      setError(err.message || "Failed to fetch jobs");
    }
  }, [endpointBase]);

  const refreshJobDetails = useCallback(async (jobId) => {
    if (!jobId) return;
    try {
      const response = await fetch(`${endpointBase}/jobs/${jobId}`);
      if (!response.ok) throw new Error(`Failed to fetch job details (${response.status})`);
      const data = await response.json();
      setSelectedJobDetails(data);
    } catch (err) {
      setError(err.message || "Failed to fetch job details");
    }
  }, [endpointBase]);

  useEffect(() => {
    refreshJobs();
    const timer = setInterval(() => {
      refreshJobs();
      if (selectedJob) refreshJobDetails(selectedJob);
    }, 2000);

    return () => clearInterval(timer);
  }, [selectedJob, refreshJobs, refreshJobDetails]);

  const launchJob = async (mode) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${endpointBase}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          env: toEnvPayload(config, mode),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Failed to start ${mode} job`);

      setSelectedJob(data.jobId);
      await refreshJobs();
      await refreshJobDetails(data.jobId);
    } catch (err) {
      setError(err.message || "Failed to launch job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="main" sx={{ flexGrow: 1, p: 3, marginTop: 0.5 }}>
      <Toolbar />
      <Paper
        sx={{
          width: "100%",
          p: 3,
          borderRadius: 4,
          border: "1px solid #e5e7eb",
          boxShadow: "0 4px 8px -2px rgba(0,0,0,0.08)",
        }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "#111827" }}>
              Stress Testing Launcher
            </Typography>
            <Typography variant="body2" sx={{ color: "#6b7280", mt: 0.5 }}>
              Starts text and voice stress jobs through a local backend endpoint and displays live summaries.
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Job Endpoint"
              fullWidth
              value={config.STRESS_JOB_ENDPOINT}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_JOB_ENDPOINT: e.target.value }))}
            />
            <TextField
              label="API Endpoint"
              fullWidth
              value={config.STRESS_API_ENDPOINT}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_API_ENDPOINT: e.target.value }))}
            />
            <TextField
              label="Socket URL"
              fullWidth
              value={config.STRESS_SOCKET_URL}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_SOCKET_URL: e.target.value }))}
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Simulation Group ID"
              fullWidth
              value={config.STRESS_SIMULATION_GROUP_ID}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_SIMULATION_GROUP_ID: e.target.value }))}
            />
            <TextField
              label="Patient ID"
              fullWidth
              value={config.STRESS_PATIENT_ID}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_PATIENT_ID: e.target.value }))}
            />
            <TextField
              label="Users"
              fullWidth
              value={config.STRESS_USERS}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_USERS: e.target.value }))}
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Messages Per User (Text)"
              fullWidth
              value={config.STRESS_MESSAGES_PER_USER}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_MESSAGES_PER_USER: e.target.value }))}
            />
            <TextField
              label="Turns Per User (Voice)"
              fullWidth
              value={config.STRESS_VOICE_TURNS}
              onChange={(e) => setConfig((prev) => ({ ...prev, STRESS_VOICE_TURNS: e.target.value }))}
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              disabled={loading}
              onClick={() => launchJob("text")}
              sx={{ backgroundColor: "#10b981", textTransform: "none", fontWeight: 700 }}
            >
              Start Text Stress Job
            </Button>
            <Button
              variant="contained"
              disabled={loading}
              onClick={() => launchJob("voice")}
              sx={{ backgroundColor: "#2563eb", textTransform: "none", fontWeight: 700 }}
            >
              Start Voice Stress Job
            </Button>
            <Button variant="outlined" onClick={refreshJobs} sx={{ textTransform: "none" }}>
              Refresh
            </Button>
          </Stack>

          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
            Recent Jobs
          </Typography>

          <TableContainer sx={{ border: "1px solid #e5e7eb", borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Job ID</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Failures</TableCell>
                  <TableCell>Duration (ms)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow
                    key={job.id}
                    hover
                    onClick={() => {
                      setSelectedJob(job.id);
                      refreshJobDetails(job.id);
                    }}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>{job.id.slice(0, 8)}</TableCell>
                    <TableCell>{job.mode}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={job.status}
                        color={statusColor[job.status] || "default"}
                      />
                    </TableCell>
                    <TableCell>{job.createdAt ? new Date(job.createdAt).toLocaleString() : "-"}</TableCell>
                    <TableCell>{job.summary?.totals?.failures ?? "-"}</TableCell>
                    <TableCell>{job.summary?.durationMs ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {selectedJobDetails?.summary && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Selected Job Summary
              </Typography>
              <Typography variant="body2" sx={{ color: "#6b7280", mb: 1 }}>
                Job {selectedJobDetails.id} • {selectedJobDetails.mode}
              </Typography>
              <TableContainer sx={{ border: "1px solid #e5e7eb", borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Phase</TableCell>
                      <TableCell>Count</TableCell>
                      <TableCell>P50</TableCell>
                      <TableCell>P95</TableCell>
                      <TableCell>P99</TableCell>
                      <TableCell>Avg</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedJobDetails.summary.phaseLatency || []).map((phase) => (
                      <TableRow key={phase.phase}>
                        <TableCell>{phase.phase}</TableCell>
                        <TableCell>{phase.count}</TableCell>
                        <TableCell>{phase.p50 ?? "-"}</TableCell>
                        <TableCell>{phase.p95 ?? "-"}</TableCell>
                        <TableCell>{phase.p99 ?? "-"}</TableCell>
                        <TableCell>{phase.avg ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Stack>
      </Paper>
    </Box>
  );
};

export default AdminStressTesting;
