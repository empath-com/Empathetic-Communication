import React from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Divider,
  Chip,
} from "@mui/material";

const CARE_DIMENSIONS = [
  { key: "avg_rapport", label: "Rapport", max: 10 },
  { key: "avg_listening", label: "Listening", max: 5 },
  { key: "avg_whole_person", label: "Whole-Person Care", max: 10 },
  { key: "avg_affective_empathy", label: "Affective Empathy", max: 5 },
  { key: "avg_communication", label: "Communication", max: 10 },
  { key: "avg_shared_planning", label: "Shared Planning", max: 10 },
];

const MAX_TOTAL = 50;

const EmpathyCoachSummary = ({ empathyData }) => {
  if (!empathyData) {
    return <Typography>No empathy data available.</Typography>;
  }

  const totalScore = parseFloat(empathyData.overall_score) || 0;
  const pct = (totalScore / MAX_TOTAL) * 100;

  const getScoreColor = (score, max) => {
    const p = score / max;
    if (p >= 0.9) return "#4CAF50";
    if (p >= 0.7) return "#8BC34A";
    if (p >= 0.5) return "#FFC107";
    if (p >= 0.3) return "#FF9800";
    return "#F44336";
  };

  const getOverallColor = () => getScoreColor(totalScore, MAX_TOTAL);

  return (
    <Box sx={{ width: "100%", p: 2 }}>
      {/* Total Score Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          CARE Measure Total Score: {totalScore} / {MAX_TOTAL}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 10,
            borderRadius: 5,
            backgroundColor: "#e0e0e0",
            "& .MuiLinearProgress-bar": { backgroundColor: getOverallColor() },
          }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <TableContainer component={Paper} elevation={3}>
        <Table sx={{ borderCollapse: "collapse" }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell colSpan={2}>
                <Typography variant="h6">
                  CARE Measure — Pharmacist–Patient Consultation
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Dimension Breakdown */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{ width: "30%", borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
              >
                <Typography variant="subtitle1">Dimension Scores</Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {CARE_DIMENSIONS.map(({ key, label, max }) => {
                    const val = parseFloat(empathyData[key]) || 0;
                    const dimPct = (val / max) * 100;
                    const color = getScoreColor(val, max);
                    return (
                      <Box key={key}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.3 }}>
                          <Typography variant="body2">{label}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                            {val}/{max}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={dimPct}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#e0e0e0",
                            "& .MuiLinearProgress-bar": { backgroundColor: color },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              </TableCell>
            </TableRow>

            {/* Coach Assessment */}
            {empathyData.summary && (
              <TableRow>
                <TableCell
                  component="th"
                  scope="row"
                  sx={{ borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
                >
                  <Typography variant="subtitle1">Coach Assessment</Typography>
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <Typography sx={{ whiteSpace: "pre-line" }}>
                    {empathyData.summary}
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {/* Strengths */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{ borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
              >
                <Typography variant="subtitle1">Strengths</Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {empathyData.strengths && empathyData.strengths.length > 0 ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {empathyData.strengths.map((s, i) => (
                      <Typography key={i}>• {s}</Typography>
                    ))}
                  </Box>
                ) : (
                  <Typography>No specific strengths identified yet.</Typography>
                )}
              </TableCell>
            </TableRow>

            {/* Areas for Improvement */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{ borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
              >
                <Typography variant="subtitle1">Areas for Improvement</Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {empathyData.areas_for_improvement && empathyData.areas_for_improvement.length > 0 ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {empathyData.areas_for_improvement.map((a, i) => (
                      <Typography key={i}>• {a}</Typography>
                    ))}
                  </Box>
                ) : (
                  <Typography>No specific areas identified yet.</Typography>
                )}
              </TableCell>
            </TableRow>

            {/* Coach Recommendations */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{ borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
              >
                <Typography variant="subtitle1">Coach Recommendations</Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {empathyData.recommendations && empathyData.recommendations.length > 0 ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {empathyData.recommendations.map((r, i) => (
                      <Typography key={i}>• {r}</Typography>
                    ))}
                  </Box>
                ) : (
                  <Typography>No specific recommendations yet.</Typography>
                )}
              </TableCell>
            </TableRow>

            {/* Focus for Next Session */}
            {empathyData.forward_target && (
              <TableRow>
                <TableCell
                  component="th"
                  scope="row"
                  sx={{ borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
                >
                  <Typography variant="subtitle1">Focus for Next Session</Typography>
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <Chip
                    label={empathyData.forward_target}
                    color="primary"
                    variant="outlined"
                    sx={{ whiteSpace: "normal", height: "auto", py: 0.5 }}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default EmpathyCoachSummary;
