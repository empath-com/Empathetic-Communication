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
} from "@mui/material";

const DOMAINS = [
  { key: "rapport",           label: "Rapport",            max: 10, criteria: "Making feel at ease + Letting tell story" },
  { key: "listening",         label: "Listening",          max: 5,  criteria: "Really listening" },
  { key: "whole_person",      label: "Whole-Person",       max: 10, criteria: "Interested in whole person + Understanding concerns" },
  { key: "affective_empathy", label: "Affective Empathy",  max: 5,  criteria: "Showing care and compassion" },
  { key: "communication",     label: "Communication",      max: 10, criteria: "Being positive + Explaining clearly" },
  { key: "shared_planning",   label: "Shared Planning",    max: 10, criteria: "Helping take control + Making a plan of action" },
];

// Color based on score normalised to 0-5: green ≥4, yellow ≥3, orange ≥2, red <2
const getScoreColor = (score) => {
  if (score >= 4) return "#4CAF50";
  if (score >= 3) return "#FFC107";
  if (score >= 2) return "#FF9800";
  return "#F44336";
};

const EmpathyCoachSummary = ({ empathyData }) => {
  if (!empathyData) {
    return <Typography>No empathy data available.</Typography>;
  }

  const overallScore = empathyData.overall_score || 0;
  const overallPct = (overallScore / 5) * 100;
  const overallColor = getScoreColor(overallScore);

  return (
    <Box sx={{ width: "100%", p: 2 }}>

      {/* Overall score bar */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>Overall Score</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>{overallScore} / 5.0</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={overallPct}
          sx={{
            height: 14,
            borderRadius: 7,
            backgroundColor: "#e0e0e0",
            "& .MuiLinearProgress-bar": { backgroundColor: overallColor, borderRadius: 7 },
          }}
        />
      </Box>

      <TableContainer component={Paper} elevation={3}>
        <Table sx={{ borderCollapse: "collapse" }}>
          <TableBody>
            {/* Criteria Breakdown */}
            <TableRow>
              <TableCell colSpan={2} sx={{ verticalAlign: "top" }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {DOMAINS.map(({ key, label, max, criteria }) => {
                    const score = empathyData[key] || 0;
                    const pct = (score / max) * 100;
                    const color = getScoreColor((score / max) * 5);
                    return (
                      <Box key={key}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.3 }}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: "medium" }}>{label}</Typography>
                            <Typography variant="caption" color="text.secondary">{criteria}</Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: "bold", ml: 1, whiteSpace: "nowrap", alignSelf: "center" }}>
                            {score} / {max}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
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

            {/* Recommendations */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{ borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
              >
                <Typography variant="subtitle1">Areas to Develop</Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {empathyData.recommendations && empathyData.recommendations.length > 0 ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {empathyData.recommendations.map((r, i) => (
                      <Typography key={i}>• {r}</Typography>
                    ))}
                  </Box>
                ) : (
                  <Typography>No specific areas to develop identified yet.</Typography>
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
                  <Typography>{empathyData.forward_target}</Typography>
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
