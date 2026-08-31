const { createDomainRoutes } = require("../shared/requestPipeline");

const groupRoutes = require("./groupRoutes.js");
const patientRoutes = require("./patientRoutes.js");
const studentRoutes = require("./studentRoutes.js");
const promptRoutes = require("./promptRoutes.js");
const accessRoutes = require("./accessRoutes.js");
const completionRoutes = require("./completionRoutes.js");
const empathyRoutes = require("./empathyRoutes.js");
const voiceRoutes = require("./voiceRoutes.js");
const analyticsRoutes = require("./analyticsRoutes.js");

const groupValidation = {
  "GET /instructor/student_group": ["email"],
  "GET /instructor/groups": ["email"],
};

const studentValidation = {
  "GET /instructor/view_students": ["simulation_group_id"],
  "DELETE /instructor/delete_student": ["simulation_group_id", "instructor_email", "user_email"],
  "GET /instructor/view_student_messages": ["student_email", "simulation_group_id"],
  "GET /instructor/student_patients_messages": ["student_email", "simulation_group_id"],
};

const voiceValidation = {
  "POST /instructor/update_voice_settings": ["simulation_group_id", "instructor_voice_enabled"],
};

const empathyValidation = {
  "GET /instructor/empathy_summary": ["student_email", "simulation_group_id"],
};

const patientValidation = {
  "POST /instructor/duplicate_patient": [
    "source_patient_id",
    "destination_simulation_group_id",
  ],
};

const routeDomains = [
  { domain: "groups", routes: createDomainRoutes("groups", groupRoutes, groupValidation) },
  { domain: "patients", routes: createDomainRoutes("patients", patientRoutes, patientValidation) },
  { domain: "students", routes: createDomainRoutes("students", studentRoutes, studentValidation) },
  { domain: "prompts", routes: createDomainRoutes("prompts", promptRoutes) },
  { domain: "access", routes: createDomainRoutes("access", accessRoutes) },
  { domain: "completion", routes: createDomainRoutes("completion", completionRoutes) },
  { domain: "empathy", routes: createDomainRoutes("empathy", empathyRoutes, empathyValidation) },
  { domain: "voice", routes: createDomainRoutes("voice", voiceRoutes, voiceValidation) },
  { domain: "analytics", routes: createDomainRoutes("analytics", analyticsRoutes) },
];

module.exports = { routeDomains };
