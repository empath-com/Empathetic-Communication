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

// For 1-5 scale scoring: green for 4-5, yellow for 3, orange for 2, red for 1
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

  const totalMessages = empathyData.total_messages_evaluated || 0;
  const totalHits = empathyData.total_criteria_hits || 0;
  const is1to5Scale = empathyData.is_1_to_5_scale === true;

  return (
    <Box sx={{ width: "100%", p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {is1to5Scale 
            ? `CARE Measure — Average score: ${empathyData.overall_score || 0}/5.0 on thread-level evaluation`
            : `CARE Measure — ${totalHits} criteria demonstrated across ${totalMessages} message${totalMessages !== 1 ? "s" : ""}`
          }
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
              <TableCell colSpan={2} sx={{ verticalAlign: "top" }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {CARE_CRITERIA.map(({ key, label }) => {
                    const score = empathyData[key] || 0;
                    let pct, color, displayText;
                    
                    if (is1to5Scale) {
                      pct = (score / 5) * 100;
                      color = getScoreColor(score);
                      displayText = `${score} / 5`;
                    } else {
                      pct = totalMessages > 0 ? (score / totalMessages) * 100 : 0;
                      color = getHitColor(score, totalMessages);
                      displayText = `${score} / ${totalMessages}`;
                    }
                    
                    return (
                      <Box key={key}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.3 }}>
                          <Typography variant="body2">{label}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: "bold", ml: 1, whiteSpace: "nowrap" }}>
                            {displayText}
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

          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default EmpathyCoachSummary;
