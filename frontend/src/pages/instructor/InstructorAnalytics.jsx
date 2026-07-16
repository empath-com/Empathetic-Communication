import { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  LinearProgress,
  Grid,
  Paper,
} from "@mui/material";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function titleCase(str) {
  if (typeof str !== "string") {
    return str;
  }
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const InstructorAnalytics = ({ groupName, simulation_group_id }) => {
  const [tabValue, setTabValue] = useState(0);
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
        const response = await fetch(
          `${
            import.meta.env.VITE_API_ENDPOINT
          }instructor/analytics?simulation_group_id=${encodeURIComponent(
            simulation_group_id
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );
        if (response.ok) {
          const analytics_data = await response.json();
          console.log("Analytics data:", analytics_data);
          setData(analytics_data);
        } else {
          console.error("Failed to fetch analytics:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching analytics:", error);
      }
    };

    fetchAnalytics();
  }, [simulation_group_id]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Container
      sx={{ flexGrow: 1, p: 3, marginTop: 9, width: "100%", overflow: "auto" }}
    >
      <Typography
        color="black"
        fontStyle="semibold"
        textAlign="left"
        variant="h6"
        gutterBottom
        sx={{ fontWeight: 600, fontSize: "1.25rem", color: "#111827" }}
      >
        {titleCase(groupName)}
      </Typography>

      {data.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "50vh",
            textAlign: "center",
            backgroundColor: "white",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
            boxShadow:
              "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.05)",
            px: 6,
          }}
        >
          <Typography
            variant="h5"
            color="textSecondary"
            sx={{ fontWeight: 500 }}
          >
            No data to display. Please check back later.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Tabs for Patients */}
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="patient tabs"
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              mb: 3,
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.9rem",
                borderRadius: "10px 10px 0 0",
                minHeight: "44px",
              },
              "& .Mui-selected": {
                color: "#059669 !important",
              },
              "& .MuiTabs-indicator": {
                backgroundColor: "#10b981",
                height: "3px",
                borderRadius: "3px 3px 0 0",
              },
            }}
          >
            {data.map((patient, index) => (
              <Tab key={index} label={titleCase(patient.patient_name)} />
            ))}
          </Tabs>

          {data.map((patient, index) => (
            <Box
              key={index}
              hidden={tabValue !== index}
              sx={{ marginTop: 2, paddingTop: 2 }}
            >
              <Typography
                variant="h6"
                color="textPrimary"
                gutterBottom
                sx={{ marginBottom: 2, fontWeight: 600, fontSize: "1.1rem" }}
              >
                {titleCase(patient.patient_name)} Overview
              </Typography>

              {/* Insights Section */}
              <Box mb={4}>
                <Paper
                  sx={{
                    borderRadius: "16px",
                    border: "1px solid #e5e7eb",
                    boxShadow:
                      "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.05)",
                  }}
                >
                  <Grid
                    container
                    spacing={2}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ padding: 2 }}
                  >
                    {/* Instructor Completion Percentage */}
                    <Grid item xs={12} sm={6}>
                      <Typography sx={{ fontWeight: 500, color: "#374151" }}>
                        Instructor Completion Percentage:
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={patient.instructor_completion_percentage || 0}
                        sx={{
                          marginY: 1,
                          height: 8,
                          borderRadius: 4,
                          "& .MuiLinearProgress-bar": {
                            backgroundColor: "#10b981",
                          },
                        }}
                      />
                      <Typography
                        textAlign="right"
                        sx={{ fontSize: "0.85rem", color: "#6b7280" }}
                      >
                        {patient.instructor_completion_percentage.toFixed(2)}%
                      </Typography>
                    </Grid>

                    {/* LLM Completion Percentage: (conditionally displayed) */}
                    {patient.llm_completion && (
                      <Grid item xs={12} sm={6}>
                        <Typography sx={{ fontWeight: 500, color: "#374151" }}>
                          LLM Completion Percentage:
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={patient.ai_score_percentage || 0}
                          sx={{
                            marginY: 1,
                            height: 8,
                            borderRadius: 4,
                            "& .MuiLinearProgress-bar": {
                              backgroundColor: "#059669",
                            },
                          }}
                        />
                        <Typography
                          textAlign="right"
                          sx={{ fontSize: "0.85rem", color: "#6b7280" }}
                        >
                          {patient.ai_score_percentage.toFixed(2)}%
                        </Typography>
                      </Grid>
                    )}

                    {/* Student and AI Message Counts with Access Count */}
                    {patient.llm_completion && (
                      <Grid item xs={12} sm={6}>
                        <Typography
                          sx={{ fontSize: "0.9rem", color: "#374151" }}
                        >
                          Student Message Count: {patient.student_message_count}
                        </Typography>
                        <Typography
                          sx={{ fontSize: "0.9rem", color: "#374151" }}
                        >
                          AI Message Count: {patient.ai_message_count}
                        </Typography>
                      </Grid>
                    )}

                    {patient.llm_completion && (
                      <Grid item xs={12} sm={6}>
                        <Typography
                          sx={{ fontSize: "0.9rem", color: "#374151" }}
                        >
                          Student Access Count: {patient.access_count}
                        </Typography>
                      </Grid>
                    )}

                    {!patient.llm_completion && (
                      <Grid item xs={12} sm={6}>
                        <Typography
                          sx={{ fontSize: "0.9rem", color: "#374151" }}
                        >
                          Student Message Count: {patient.student_message_count}
                        </Typography>
                        <Typography
                          sx={{ fontSize: "0.9rem", color: "#374151" }}
                        >
                          AI Message Count: {patient.ai_message_count}
                        </Typography>
                        <Typography
                          sx={{ fontSize: "0.9rem", color: "#374151" }}
                        >
                          Student Access Count: {patient.access_count}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              </Box>

              {/* Message Count Chart */}
              <Paper
                sx={{
                  borderRadius: "16px",
                  mb: 4,
                  border: "1px solid #e5e7eb",
                  boxShadow:
                    "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.05)",
                }}
              >
                <Box mb={4} sx={{ height: 400, paddingBottom: 2 }}>
                  <Typography
                    color="black"
                    textAlign="left"
                    paddingLeft={2}
                    padding={2}
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: "#374151",
                    }}
                  >
                    Message Count
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: "Messages",
                          StudentMessages:
                            parseInt(patient.student_message_count, 10) || 0,
                          AIMessages:
                            parseInt(patient.ai_message_count, 10) || 0,
                        },
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                      barSize={28}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        tickMargin={10}
                        tick={{ fill: "#6b7280", fontSize: 12 }}
                      />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="StudentMessages"
                        fill="#10b981"
                        name="Student Messages"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="AIMessages"
                        fill="#059669"
                        name="AI Messages"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              {/* Completion Chart */}
              <Paper
                sx={{
                  borderRadius: "16px",
                  border: "1px solid #e5e7eb",
                  boxShadow:
                    "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.05)",
                }}
              >
                <Box mb={4} sx={{ height: 400, paddingBottom: 2 }}>
                  <Typography
                    color="black"
                    textAlign="left"
                    paddingLeft={2}
                    padding={2}
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: "#374151",
                    }}
                  >
                    Completion Overview
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: "Completion",
                          InstructorCompletion:
                            parseFloat(
                              patient.instructor_completion_percentage
                            ) || 0,
                          LLMCompletion: patient.llm_completion
                            ? parseFloat(patient.ai_score_percentage) || 0
                            : null,
                        },
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                      barSize={28}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        tickMargin={10}
                        tick={{ fill: "#6b7280", fontSize: 12 }}
                      />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="InstructorCompletion"
                        fill="#f59e0b"
                        name="Instructor Completion %"
                        radius={[6, 6, 0, 0]}
                      />
                      {patient.llm_completion && (
                        <Bar
                          dataKey="LLMCompletion"
                          fill="#6366f1"
                          name="LLM Completion %"
                          radius={[6, 6, 0, 0]}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Box>
          ))}
        </>
      )}
    </Container>
  );
};

export default InstructorAnalytics;
