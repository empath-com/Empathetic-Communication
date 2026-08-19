import { useMemo, useRef, useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { apiPost } from "../../utils/apiClient";
import html2canvas from "html2canvas";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const CHART_TYPE_STORAGE_KEY = "admin-ai-analytics-chart-type";

const CHART_COLORS = [
  "#10b981",
  "#2563eb",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

const ResultChart = ({ chart, rows }) => {
  const type = chart?.type || "table";
  const xColumn = chart?.xColumn;
  const yColumn = chart?.yColumn;

  const chartData = useMemo(() => {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .slice(0, 50)
      .map((row) => ({
        ...row,
        __x: xColumn ? String(row[xColumn]) : "",
        __y: yColumn ? Number(row[yColumn]) || 0 : 0,
      }))
      .filter((row) => row.__x !== "");
  }, [rows, xColumn, yColumn]);

  if (type === "table" || !xColumn || !yColumn || chartData.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "#6b7280" }}>
        No graphable numeric series found for this result. Table view is shown below.
      </Typography>
    );
  }

  if (type === "pie") {
    return (
      <Box sx={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="__y" nameKey="__x" outerRadius={110}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${entry.__x}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    );
  }

  if (type === "line") {
    return (
      <Box sx={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="__x" angle={-25} textAnchor="end" height={70} interval={0} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="__y" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="__x" angle={-25} textAnchor="end" height={70} interval={0} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="__y" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};

const coerceChartType = (type) => {
  const normalized = String(type || "").toLowerCase();
  if (["bar", "line", "pie", "table"].includes(normalized)) {
    return normalized;
  }
  return "bar";
};

const ResultsTable = ({ columns, rows }) => {
  if (!columns?.length) {
    return (
      <Typography variant="body2" sx={{ color: "#6b7280" }}>
        Query executed successfully but returned no rows.
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ border: "1px solid #e5e7eb", borderRadius: 2, maxHeight: 420 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column} sx={{ fontWeight: 700 }}>
                {column}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, 200).map((row, idx) => (
            <TableRow key={`row-${idx}`}>
              {columns.map((column) => (
                <TableCell key={`${idx}-${column}`}>
                  {row[column] === null || row[column] === undefined ? "-" : String(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

const AdminAIAnalytics = () => {
  const chartRef = useRef(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedChartType, setSelectedChartType] = useState(() => {
    if (typeof window === "undefined") {
      return "bar";
    }

    return coerceChartType(window.localStorage.getItem(CHART_TYPE_STORAGE_KEY));
  });
  const [exportingChart, setExportingChart] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CHART_TYPE_STORAGE_KEY, selectedChartType);
  }, [selectedChartType]);

  const runAnalysis = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError("Please ask an analytics question.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiPost("admin/ai_analytics_query", { question: trimmedQuestion });
      setResult(data);
      const storedChartType =
        typeof window === "undefined"
          ? null
          : window.localStorage.getItem(CHART_TYPE_STORAGE_KEY);
      setSelectedChartType(coerceChartType(storedChartType || data?.chart?.type));
    } catch (err) {
      setError(err.message || "Failed to run analytics query");
    } finally {
      setLoading(false);
    }
  };

  const runConversationAnalyticsBackfill = async () => {
    setBackfilling(true);
    setBackfillStatus("");
    setError("");

    try {
      const data = await apiPost("admin/backfill_conversation_analytics");
      setBackfillStatus(
        `${data.dispatched || 0} of ${data.queued || 0} completed sessions queued for analytics processing.`
      );
    } catch (err) {
      setError(err.message || "Failed to queue conversation analytics backfill");
    } finally {
      setBackfilling(false);
    }
  };

  const handleChartTypeChange = (_event, nextType) => {
    if (nextType) {
      setSelectedChartType(nextType);
    }
  };

  const handleDownloadChart = async () => {
    if (!chartRef.current) {
      setError("No chart is available to export.");
      return;
    }

    try {
      setExportingChart(true);
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      const safeTitle = (result?.chart?.title || "ai-analytics-chart")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      link.download = `${safeTitle || "ai-analytics-chart"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      setError(err.message || "Failed to export chart.");
    } finally {
      setExportingChart(false);
    }
  };

  const effectiveChart = useMemo(() => {
    if (!result?.chart) {
      return null;
    }
    return {
      ...result.chart,
      type: selectedChartType,
    };
  }, [result, selectedChartType]);

  return (
    <Box
      sx={{
        ml: { xs: 0, md: 28 },
        mt: 12,
        p: 3,
        height: "calc(100vh - 96px)",
        overflowY: "auto",
      }}
    >
      <Typography variant="h5" sx={{ mb: 1, color: "#111827" }}>
        AI Analytics Assistant
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, color: "#4b5563" }}>
        Ask plain-language questions. The assistant generates a schema-aware read-only SQL query, runs it,
        and returns plotted graphs and a result table.
      </Typography>

      <Card sx={{ borderRadius: 3, border: "1px solid #dbe4db", mb: 3, backgroundColor: "#f7fbf8" }}>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "center" }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#17342e" }}>
                Conversation Analytics Backfill
              </Typography>
              <Typography variant="body2" sx={{ color: "#4b5563" }}>
                Queue terminal analytics for completed simulations that do not yet have an analytics snapshot.
              </Typography>
              {backfillStatus && <Typography variant="body2" sx={{ color: "#047857", mt: 1 }}>{backfillStatus}</Typography>}
            </Box>
            <Button
              variant="contained"
              color="success"
              onClick={runConversationAnalyticsBackfill}
              disabled={backfilling}
            >
              {backfilling ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Backfill Analytics"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb", mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Ask a data question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              multiline
              minRows={3}
              placeholder="Example: Which simulation groups had the highest completed exercise counts in the last 30 days?"
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                sx={{ backgroundColor: "#10b981", "&:hover": { backgroundColor: "#059669" } }}
                onClick={runAnalysis}
                disabled={loading}
              >
                {loading ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Run Analysis"}
              </Button>
            </Stack>
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      {result && (
        <Stack spacing={3}>
          <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb" }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Generated SQL
              </Typography>
              <Box sx={{ backgroundColor: "#111827", color: "#e5e7eb", p: 2, borderRadius: 2, overflowX: "auto" }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{result.sql}</pre>
              </Box>
              {result.summary && (
                <Typography variant="body2" sx={{ mt: 2, color: "#374151" }}>
                  {result.summary}
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb" }}>
            <CardContent>
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                spacing={1.5}
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Graph
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={selectedChartType}
                    onChange={handleChartTypeChange}
                    aria-label="chart type"
                  >
                    <ToggleButton value="bar" aria-label="bar chart">Bar</ToggleButton>
                    <ToggleButton value="line" aria-label="line chart">Line</ToggleButton>
                    <ToggleButton value="pie" aria-label="pie chart">Pie</ToggleButton>
                    <ToggleButton value="table" aria-label="table only">Table</ToggleButton>
                  </ToggleButtonGroup>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleDownloadChart}
                    disabled={exportingChart || !result}
                  >
                    {exportingChart ? "Exporting..." : "Download PNG"}
                  </Button>
                </Stack>
              </Stack>
              <Typography variant="caption" sx={{ display: "block", mb: 1.5, color: "#6b7280" }}>
                Switch visualization type without re-running the query. Your selection is saved for future visits.
              </Typography>
              <Box ref={chartRef} sx={{ backgroundColor: "#ffffff", p: 1, borderRadius: 2 }}>
                <ResultChart chart={effectiveChart} rows={result.rows || []} />
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb" }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Results Table
              </Typography>
              <ResultsTable columns={result.columns || []} rows={result.rows || []} />
            </CardContent>
          </Card>
        </Stack>
      )}
    </Box>
  );
};

export default AdminAIAnalytics;
