import { Box, Paper, Typography } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const METRIC_LABELS = {
  empathy_statements: "Empathy statements",
  open_ended_questions: "Open-ended questions",
  affirmations: "Affirmations",
  missed_empathy_opportunities: "Missed empathy opportunities",
  interruptions: "Interruptions",
  patient_centered_language: "Patient-centered language",
  jargon_usage: "Jargon usage",
};

const TOPIC_LABELS = {
  empathy: "Empathy",
  open_ended_questions: "Open-ended questions",
  affirmations: "Affirmations",
  patient_centered_language: "Patient-centered language",
  plain_language: "Plain language",
  shared_decision_making: "Shared decision-making",
};

const COLORS = ["#0f766e", "#2563eb", "#d97706", "#be123c", "#4f46e5", "#15803d", "#b45309"];

function ChartPanel({ title, subtitle, children }) {
  return (
    <Paper component="section" elevation={0} sx={{ border: "1px solid #dbe4db", borderRadius: 2, p: 2.25, minHeight: 360 }}>
      <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, color: "#17342e" }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "#61716d", mb: 1.5 }}>
        {subtitle}
      </Typography>
      {children}
    </Paper>
  );
}

function EmptyChart() {
  return <Box sx={{ height: 250, display: "grid", placeItems: "center", color: "#71807c" }}>No completed analytics match these filters.</Box>;
}

function TooltipSeconds({ value }) {
  return `${Math.round(Number(value || 0) / 60)} min`;
}

export default function AnalyticsVisualizations({ report }) {
  const recommendations = (report.recommendations || []).map((row) => ({
    name: TOPIC_LABELS[row.topic_key] || row.topic_key,
    count: row.count,
  }));
  const metrics = (report.communication_metrics || []).map((row) => ({
    name: METRIC_LABELS[row.metric_key] || row.metric_key,
    count: row.count,
  }));
  const cases = report.completion_by_case || [];
  const engagement = report.engagement_distribution || [];
  const unfinished = report.unfinished_attempts || [];
  const studentEngagement = report.student_engagement || [];

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2.25 }}>
      <ChartPanel title="Coaching Priorities" subtitle="Recommendation topics across evaluated attempts.">
        {recommendations.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={recommendations} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#e4ece7" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="Attempts" fill="#0f766e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Communication Signals" subtitle="Observed counts from the fixed terminal conversation rubric.">
        {metrics.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={metrics} margin={{ bottom: 55 }}>
              <CartesianGrid stroke="#e4ece7" vertical={false} />
              <XAxis dataKey="name" interval={0} angle={-28} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {metrics.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Engagement Distribution" subtitle="Focused-browser time compared with dialogue turns per attempt.">
        {engagement.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <ScatterChart margin={{ top: 10, right: 16, bottom: 15, left: 10 }}>
              <CartesianGrid stroke="#e4ece7" />
              <XAxis type="number" dataKey="active_duration_seconds" name="Focused time" tickFormatter={(value) => Math.round(value / 60)} unit=" min" />
              <YAxis type="number" dataKey="dialogue_turn_count" name="Dialogue turns" allowDecimals={false} />
              <Tooltip formatter={(value, name) => name === "Focused time" ? TooltipSeconds({ value }) : value} />
              <Scatter name="Attempts" data={engagement} fill="#2563eb" />
            </ScatterChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Attempts and Performance" subtitle="Attempt sequence compared with terminal communication score.">
        {engagement.filter((row) => row.communication_score !== null).length ? (
          <ResponsiveContainer width="100%" height={255}>
            <ScatterChart margin={{ top: 10, right: 16, bottom: 15, left: 10 }}>
              <CartesianGrid stroke="#e4ece7" />
              <XAxis type="number" dataKey="attempt_number" name="Attempt number" allowDecimals={false} />
              <YAxis type="number" dataKey="communication_score" name="Communication score" domain={[0, 100]} />
              <Tooltip />
              <Scatter name="Analyzed attempts" data={engagement.filter((row) => row.communication_score !== null)} fill="#d97706" />
            </ScatterChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Case Completion" subtitle="Completed attempts as a percentage of all started attempts.">
        {cases.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={cases} margin={{ bottom: 45 }}>
              <CartesianGrid stroke="#e4ece7" vertical={false} />
              <XAxis dataKey="patient_name" interval={0} angle={-22} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(value) => `${value}%`} />
              <Bar dataKey="completion_rate" name="Completion rate" fill="#15803d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Case Performance" subtitle="Communication score and objective achievement reveal case difficulty.">
        {cases.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={cases} margin={{ bottom: 45 }}>
              <CartesianGrid stroke="#e4ece7" vertical={false} />
              <XAxis dataKey="patient_name" interval={0} angle={-22} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
              <Bar dataKey="average_communication_score" name="Communication score" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="objective_achievement_rate" name="Objective achieved" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Unfinished Attempts" subtitle="In-progress attempts grouped by the final practitioner dialogue turn.">
        {unfinished.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={unfinished}>
              <CartesianGrid stroke="#e4ece7" vertical={false} />
              <XAxis dataKey="stage" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Attempts" fill="#be123c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>

      <ChartPanel title="Student Engagement" subtitle="Focused time and completed cases by student for the selected cohort.">
        {studentEngagement.length ? (
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={studentEngagement} margin={{ bottom: 55 }}>
              <CartesianGrid stroke="#e4ece7" vertical={false} />
              <XAxis dataKey="student_name" interval={0} angle={-24} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="minutes" tickFormatter={(value) => Math.round(value / 60)} />
              <YAxis yAxisId="cases" orientation="right" allowDecimals={false} />
              <Tooltip formatter={(value, name) => name === "Focused time" ? TooltipSeconds({ value }) : value} />
              <Legend />
              <Bar yAxisId="minutes" dataKey="active_duration_seconds" name="Focused time" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="cases" dataKey="cases_completed" name="Completed cases" fill="#15803d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartPanel>
    </Box>
  );
}