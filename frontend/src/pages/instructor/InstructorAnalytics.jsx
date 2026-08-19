import { Alert, Box, Button, Container, Paper, Skeleton, Typography } from "@mui/material";
import AnalyticsFilters from "./AnalyticsFilters";
import AnalyticsVisualizations from "./AnalyticsVisualizations";
import useInstructorAnalytics from "./hooks/useInstructorAnalytics";

function Metric({ label, value, detail }) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid #dbe4db", borderRadius: 2, p: 2, minWidth: 145 }}>
      <Typography variant="body2" sx={{ color: "#61716d" }}>{label}</Typography>
      <Typography variant="h5" sx={{ color: "#17342e", fontWeight: 700, mt: 0.4 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: "#71807c" }}>{detail}</Typography>
    </Paper>
  );
}

export default function InstructorAnalytics({ simulation_group_id: initialSimulationGroupId }) {
  const { filters, report, loading, error, updateFilter, clearFilters, reload } =
    useInstructorAnalytics(initialSimulationGroupId);
  const coverage = report?.coverage || {};
  const completionRate = coverage.total_attempts
    ? Math.round((coverage.completed_attempts / coverage.total_attempts) * 100)
    : 0;

  return (
    <Container
      maxWidth={false}
      sx={{
        flexGrow: 1,
        minWidth: 0,
        minHeight: 0,
        height: "calc(100vh - 72px)",
        overflowY: "auto",
        overflowX: "hidden",
        p: { xs: 2, md: 3 },
        mt: 9,
        bgcolor: "#f5f8f5",
      }}
    >
      <Box sx={{ maxWidth: 1560, mx: "auto" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2 }}>
          <Box>
            <Typography component="h1" variant="h5" sx={{ color: "#17342e", fontWeight: 750 }}>
              Learning Analytics
            </Typography>
            <Typography variant="body2" sx={{ color: "#61716d", mt: 0.5 }}>
              Cohort patterns from completed simulation attempts and terminal communication analysis.
            </Typography>
          </Box>
          <Button variant="outlined" color="inherit" onClick={reload} disabled={loading}>Refresh</Button>
        </Box>

        <AnalyticsFilters filters={filters} options={report?.filters || {}} onChange={updateFilter} onClear={clearFilters} />

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading && !report ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
            {[1, 2, 3, 4, 5, 6].map((key) => <Skeleton key={key} variant="rounded" height={220} />)}
          </Box>
        ) : (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2.25 }}>
              <Metric label="Attempts" value={coverage.total_attempts || 0} detail="Started sessions" />
              <Metric label="Completion" value={`${completionRate}%`} detail={`${coverage.completed_attempts || 0} completed`} />
              <Metric label="Analyzed" value={coverage.analyzed_attempts || 0} detail="Terminal rubric snapshots" />
              <Metric label="Processing" value={coverage.pending_analytics || 0} detail="Pending analytics jobs" />
            </Box>
            {coverage.total_attempts === 0 ? (
              <Paper elevation={0} sx={{ border: "1px solid #dbe4db", borderRadius: 2, p: 6, textAlign: "center", color: "#61716d" }}>
                No attempts match these filters yet.
              </Paper>
            ) : (
              <AnalyticsVisualizations report={report} />
            )}
          </>
        )}
      </Box>
    </Container>
  );
}
