import { useEffect, useState } from "react";
import { Card, CardContent, Typography, Box } from "@mui/material";
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

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;

        const res = await fetch(
          `${import.meta.env.VITE_API_ENDPOINT}admin/active_students_count`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || res.statusText);
        }
        setActiveStudents(data.active_students ?? 0);

        // Fetch completed exercises KPI
        const resCompleted = await fetch(
          `${import.meta.env.VITE_API_ENDPOINT}admin/completed_exercises_count`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );
        const dataCompleted = await resCompleted.json();
        if (!resCompleted.ok) {
          throw new Error(dataCompleted?.error || resCompleted.statusText);
        }
        // using unique student count who completed at least one exercise
        setCompletedExercises(dataCompleted.completed_students ?? 0);

        // Fetch trends (last 30 days)
        const resActiveTrend = await fetch(
          `${import.meta.env.VITE_API_ENDPOINT}admin/active_students_trend?days=30`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );
        const trendActive = await resActiveTrend.json();
        // Map to daily counts array in order
        setActiveTrend(Array.isArray(trendActive) ? trendActive.map((d) => d.count) : []);

        const resCompletedTrend = await fetch(
          `${import.meta.env.VITE_API_ENDPOINT}admin/completed_exercises_trend?days=30`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );
        const trendCompleted = await resCompletedTrend.json();
        setCompletedTrend(Array.isArray(trendCompleted) ? trendCompleted.map((d) => d.count) : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <Box sx={{ ml: { xs: 0, md: 28 }, mt: 12, p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2, color: "#111827" }}>
        Statistics
      </Typography>
      <Typography variant="body2" sx={{ mb: 3, color: "#6b7280" }}>
        Overview of key metrics. More KPIs and graphs coming soon.
      </Typography>

      <Box
        sx={{
          value={loading ? "…" : error ? "—" : activeStudents}
          trend={loading ? [] : activeTrend}
          gridTemplateColumns: {
            xs: "1fr",
          title="Students Completed ≥1 Exercise"
          value={loading ? "…" : error ? "—" : completedExercises}
          trend={loading ? [] : completedTrend}
          },
          gap: 2,
        }}
      >
        <KPICard
          title="Active Students"
          value={loading ? "…" : error ? "—" : activeStudents}
        />
        <KPICard
          title="Completed Exercises"
          value={loading ? "…" : error ? "—" : completedExercises}
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