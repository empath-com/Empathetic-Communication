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

const CARE_CRITERIA = [
  { key: "making_feel_at_ease",        label: "Making you feel at ease" },
  { key: "letting_tell_story",         label: "Letting you tell your story" },
  { key: "really_listening",           label: "Really listening" },
  { key: "interested_in_whole_person", label: "Being interested in you as a whole person" },
  { key: "understanding_concerns",     label: "Fully understanding your concerns" },
  { key: "showing_care_compassion",    label: "Showing care and compassion" },
  { key: "being_positive",             label: "Being positive" },
  { key: "explaining_clearly",         label: "Explaining things clearly" },
  { key: "helping_take_control",       label: "Helping you take control" },
  { key: "making_plan_of_action",      label: "Making a plan of action with you" },
];

const getHitColor = (hits, total) => {
  if (!total) return "#9E9E9E";
  const rate = hits / total;
  if (rate >= 0.8) return "#4CAF50";
  if (rate >= 0.6) return "#8BC34A";
  if (rate >= 0.4) return "#FFC107";
  if (rate >= 0.2) return "#FF9800";
  return "#F44336";
};

const EmpathyCoachSummary = ({ empathyData }) => {
  if (!empathyData) {
    return <Typography>No empathy data available.</Typography>;
  }

  const totalMessages = empathyData.total_messages_evaluated || 0;
  const totalHits = empathyData.total_criteria_hits || 0;

  return (
    <Box sx={{ width: "100%", p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          CARE Measure — {totalHits} criteria demonstrated across {totalMessages} message{totalMessages !== 1 ? "s" : ""}
        </Typography>
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
            {/* Criteria Breakdown */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{ width: "30%", borderRight: "1px solid rgba(224,224,224,1)", verticalAlign: "top" }}
              >
                <Typography variant="subtitle1">Criterion Hits</Typography>
                <Typography variant="caption" color="text.secondary">
                  out of {totalMessages} message{totalMessages !== 1 ? "s" : ""}
                </Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {CARE_CRITERIA.map(({ key, label }) => {
                    const hits = empathyData[key] || 0;
                    const pct = totalMessages > 0 ? (hits / totalMessages) * 100 : 0;
                    const color = getHitColor(hits, totalMessages);
                    return (
                      <Box key={key}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.3 }}>
                          <Typography variant="body2">{label}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: "bold", ml: 1, whiteSpace: "nowrap" }}>
                            {hits} / {totalMessages}
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
