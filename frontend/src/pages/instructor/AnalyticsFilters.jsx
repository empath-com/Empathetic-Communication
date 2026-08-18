import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
} from "@mui/material";

function FilterSelect({ id, label, value, options, getLabel, onChange }) {
  return (
    <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 190 } }}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        id={id}
        value={value || ""}
        label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="">All {label.toLowerCase()}s</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.id} value={option.id}>
            {getLabel(option)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default function AnalyticsFilters({ filters, options, onChange, onClear }) {
  const groups = (options.groups || []).map((group) => ({ id: group.simulation_group_id, ...group }));
  const patients = (options.patients || []).map((patient) => ({ id: patient.patient_id, ...patient }));
  const students = (options.students || []).map((student) => ({ id: student.student_user_id, ...student }));

  return (
    <Paper
      component="section"
      aria-label="Analytics filters"
      elevation={0}
      sx={{ border: "1px solid #dbe4db", borderRadius: 2, p: 2, mb: 2.5 }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <FilterSelect
          id="analytics-group"
          label="Group"
          value={filters.simulationGroupId}
          options={groups}
          getLabel={(group) => group.group_name}
          onChange={(value) => onChange("simulationGroupId", value)}
        />
        <FilterSelect
          id="analytics-patient"
          label="Patient"
          value={filters.patientId}
          options={patients}
          getLabel={(patient) => patient.patient_name}
          onChange={(value) => onChange("patientId", value)}
        />
        <FilterSelect
          id="analytics-student"
          label="Student"
          value={filters.studentUserId}
          options={students}
          getLabel={(student) => student.student_name}
          onChange={(value) => onChange("studentUserId", value)}
        />
        <Button variant="text" color="inherit" onClick={onClear} sx={{ ml: { sm: "auto" } }}>
          Clear filters
        </Button>
      </Box>
    </Paper>
  );
}