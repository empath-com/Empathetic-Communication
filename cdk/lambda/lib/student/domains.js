const { createDomainRoutes } = require("../shared/requestPipeline");

const userRoutes = require("./userRoutes.js");
const groupRoutes = require("./groupRoutes.js");
const patientRoutes = require("./patientRoutes.js");
const sessionRoutes = require("./sessionRoutes.js");
const messageRoutes = require("./messageRoutes.js");
const enrollmentRoutes = require("./enrollmentRoutes.js");
const progressRoutes = require("./progressRoutes.js");
const notesRoutes = require("./notesRoutes.js");
const empathyRoutes = require("./empathyRoutes.js");
const voiceRoutes = require("./voiceRoutes.js");

const userValidation = {
  "POST /student/create_user": ["user_email", "username", "first_name", "last_name"],
  "GET /student/get_user_roles": ["user_email"],
  "GET /student/get_name": ["user_email"],
};

const groupValidation = {
  "GET /student/simulation_group": ["email"],
  "GET /student/simulation_group_page": ["email", "simulation_group_id"],
};

const sessionValidation = {
  "POST /student/create_session": ["patient_id", "email", "simulation_group_id", "session_name"],
  "DELETE /student/delete_session": ["session_id", "email", "simulation_group_id", "patient_id"],
  "GET /student/get_messages": ["session_id"],
  "GET /session/messages": ["session_id"],
  "PUT /student/update_session_name": ["session_id"],
};

const empathyValidation = {
  "GET /student/empathy_summary": ["email", "simulation_group_id"],
  "GET /student/empathy_enabled": ["simulation_group_id"],
};

const progressValidation = {
  "POST /student/record_session_activity": ["session_id", "student_email", "simulation_group_id"],
  "POST /student/complete_session": ["session_id", "student_email", "simulation_group_id"],
};

const voiceValidation = {
  "GET /student/voice_enabled": ["simulation_group_id"],
};

const routeDomains = [
  { domain: "students", routes: createDomainRoutes("students", userRoutes, userValidation) },
  { domain: "groups", routes: createDomainRoutes("groups", groupRoutes, groupValidation) },
  { domain: "patients", routes: createDomainRoutes("patients", patientRoutes) },
  { domain: "sessions", routes: createDomainRoutes("sessions", sessionRoutes, sessionValidation) },
  { domain: "messages", routes: createDomainRoutes("messages", messageRoutes) },
  { domain: "enrollments", routes: createDomainRoutes("enrollments", enrollmentRoutes) },
  { domain: "progress", routes: createDomainRoutes("progress", progressRoutes, progressValidation) },
  { domain: "notes", routes: createDomainRoutes("notes", notesRoutes) },
  { domain: "empathy", routes: createDomainRoutes("empathy", empathyRoutes, empathyValidation) },
  { domain: "voice", routes: createDomainRoutes("voice", voiceRoutes, voiceValidation) },
];

module.exports = { routeDomains };
