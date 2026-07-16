import { useEffect, useState } from "react";
import { Card, CardContent, Typography, Box, Stack, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import { fetchAuthSession } from "aws-amplify/auth";

const Sparkline = ({ data = [], width = 220, height = 48, stroke = "#10b981" }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pad = 4;
  const n = data.length;
  const xStep = (width - pad * 2) / (n - 1);
  const yScale = (height - pad * 2) / (max - min || 1);
  const points = data.map((v, i) => {
    const x = pad + i * xStep;
    const y = height - pad - (v - min) * yScale;
    return `${x},${y}`;
  });
  const path = points.join(" ");
  return (
    <svg width={width} height={height}>
      <polyline
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

const KPICard = ({ title, value, trend }) => (
  <Card
    sx={{
      borderRadius: 3,
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      border: "1px solid #e5e7eb",
    }}
  >
    <CardContent>
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h4" sx={{ mt: 1, color: "#111827" }}>
        {value}
      </Typography>
      {Array.isArray(trend) && trend.length > 1 && (
        <Box sx={{ mt: 1 }}>
          <Sparkline data={trend} />
        </Box>
      )}
    </CardContent>
  </Card>
);

const AdminStatistics = () => {
  const [activeStudents, setActiveStudents] = useState(null);
  const [completedExercises, setCompletedExercises] = useState(null);
  const [activeTrend, setActiveTrend] = useState([]);
  const [completedTrend, setCompletedTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(""); // empty string means All groups
  const [days, setDays] = useState(30);

  const normalizeTrend = (rows, windowDays) => {
    // rows: [{ day: 'YYYY-MM-DD', count: number }, ...]
    if (!Array.isArray(rows) || rows.length === 0) return Array(windowDays).fill(0);
    const map = new Map(rows.map(r => [String(r.day), r.count]));
    const out = [];
    const today = new Date();
    // build from oldest to newest over the window
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const s = d.toISOString().slice(0, 10);
      out.push(map.get(s) || 0);
    }
    return out;
  };

  const fetchGroups = async (token) => {
    const res = await fetch(`${import.meta.env.VITE_API_ENDPOINT}admin/simulation_groups`, {
      method: "GET",
      headers: { Authorization: token, "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || res.statusText);
    setGroups(Array.isArray(data) ? data.map(g => ({ id: g.simulation_group_id, name: g.group_name })) : []);
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      // Fetch groups once (if empty)
      if (groups.length === 0) {
        try { await fetchGroups(token); } catch (e) { /* non-blocking */ }
      }

      const params = new URLSearchParams();
      if (days) params.set("days", String(days));
      if (groupId) params.set("simulation_group_id", groupId);

      // KPIs
      const resActive = await fetch(`${import.meta.env.VITE_API_ENDPOINT}admin/active_students_count?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: token, "Content-Type": "application/json" },
      });
      const dataActive = await resActive.json();
      if (!resActive.ok) throw new Error(dataActive?.error || resActive.statusText);
      setActiveStudents(dataActive.active_students ?? 0);

      const resCompleted = await fetch(`${import.meta.env.VITE_API_ENDPOINT}admin/completed_exercises_count?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: token, "Content-Type": "application/json" },
      });
      const dataCompleted = await resCompleted.json();
      if (!resCompleted.ok) throw new Error(dataCompleted?.error || resCompleted.statusText);
      setCompletedExercises(dataCompleted.completed_students ?? 0);

      // Trends
      const resActiveTrend = await fetch(`${import.meta.env.VITE_API_ENDPOINT}admin/active_students_trend?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: token, "Content-Type": "application/json" },
      });
      const trendActiveRows = await resActiveTrend.json();
      setActiveTrend(normalizeTrend(trendActiveRows, days));

      const resCompletedTrend = await fetch(`${import.meta.env.VITE_API_ENDPOINT}admin/completed_exercises_trend?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: token, "Content-Type": "application/json" },
      });
      const trendCompletedRows = await resCompletedTrend.json();
      setCompletedTrend(normalizeTrend(trendCompletedRows, days));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [groupId, days]);

  return (
    <Box sx={{ ml: { xs: 0, md: 28 }, mt: 12, p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2, color: "#111827" }}>
        Statistics
      </Typography>
      <Typography variant="body2" sx={{ mb: 3, color: "#6b7280" }}>
        Overview of key metrics. Use filters to refine.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="group-select-label">Group</InputLabel>
          <Select
            labelId="group-select-label"
            value={groupId}
            label="Group"
            onChange={(e) => setGroupId(e.target.value)}
          >
            <MenuItem value="">All groups</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="days-select-label">Range</InputLabel>
          <Select
            labelId="days-select-label"
            value={days}
            label="Range"
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <KPICard
          title="Active Students"
          value={loading ? "…" : error ? "—" : activeStudents}
          trend={loading ? [] : activeTrend}
        />
        <KPICard
          title="Students Completed ≥1 Exercise"
          value={loading ? "…" : error ? "—" : completedExercises}
          trend={loading ? [] : completedTrend}
        />
      </Box>

      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 2, display: "block" }}>
          Failed to load statistics: {error}
        </Typography>
      )}
    </Box>
  );
};

export default AdminStatistics;