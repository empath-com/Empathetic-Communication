const { NotFoundError } = require("../shared/errors");
const { getUserIdByEmail } = require("./usersService");

async function getStudentSimulationGroups(sqlConnection, userEmail) {
  const userId = await getUserIdByEmail(sqlConnection, userEmail);

  return sqlConnection`
    SELECT "simulation_groups".*
    FROM "enrolments"
    JOIN "simulation_groups" ON "simulation_groups".simulation_group_id = "enrolments".simulation_group_id
    WHERE "enrolments".user_id = ${userId}
    AND "simulation_groups".group_student_access = TRUE
    ORDER BY "simulation_groups".group_name, "simulation_groups".simulation_group_id;
  `;
}

async function getSimulationGroupsByUser(sqlConnection, userEmail) {
  const userId = await getUserIdByEmail(sqlConnection, userEmail);

  return sqlConnection`
    SELECT sg.*
    FROM "enrolments" e
    JOIN "simulation_groups" sg
    ON e.simulation_group_id = sg.simulation_group_id
    WHERE e.user_id = ${userId}
    ORDER BY sg.group_name, sg.simulation_group_id;
  `;
}

async function getInstructorGroups(sqlConnection, instructorEmail) {
  const userId = await getUserIdByEmail(sqlConnection, instructorEmail);

  return sqlConnection`
    SELECT g.*
    FROM "enrolments" e
    JOIN "simulation_groups" g ON e.simulation_group_id = g.simulation_group_id
    WHERE e.user_id = ${userId}
    AND e.enrolment_type = 'instructor'
    ORDER BY g.group_name, g.simulation_group_id;
  `;
}

async function getStudentGroupPage(sqlConnection, studentEmail, simulationGroupId) {
  const userId = await getUserIdByEmail(sqlConnection, studentEmail);

  const data = await sqlConnection`
    WITH StudentEnrollment AS (
      SELECT enrolment_id
      FROM "enrolments"
      WHERE user_id = ${userId}
      AND simulation_group_id = ${simulationGroupId}
      LIMIT 1
    )
    SELECT
      p.patient_id,
      p.patient_name,
      p.patient_age,
      p.patient_gender,
      p.patient_number,
      p.llm_completion,
      sp.student_interaction_id,
      sp.patient_score,
      sp.last_accessed,
      sp.patient_context_embedding,
      sp.is_completed
    FROM "patients" p
    LEFT JOIN "student_interactions" sp ON sp.patient_id = p.patient_id
    JOIN StudentEnrollment se ON sp.enrolment_id = se.enrolment_id
    WHERE p.simulation_group_id = ${simulationGroupId}
    ORDER BY p.patient_number;
  `;

  return { userId, data };
}

async function getEnrolmentId(sqlConnection, userId, simulationGroupId) {
  const enrolmentData = await sqlConnection`
    SELECT enrolment_id
    FROM "enrolments"
    WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId}
    LIMIT 1;
  `;

  return enrolmentData[0]?.enrolment_id || null;
}

async function logGroupAccess(sqlConnection, userId, simulationGroupId, enrolmentId) {
  if (!enrolmentId) return;

  await sqlConnection`
    INSERT INTO "user_engagement_log" (
      log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
    ) VALUES (
      uuid_generate_v4(), ${userId}, ${simulationGroupId}, null, ${enrolmentId}, CURRENT_TIMESTAMP, 'group access'
    );
  `;
}

async function getSimulationGroupEmpathyConfig(sqlConnection, simulationGroupId) {
  const empathyResult = await sqlConnection`
    SELECT empathy_enabled, empathy_tool_override, empathy_prompt_override
    FROM "simulation_groups"
    WHERE simulation_group_id = ${simulationGroupId}
  `;

  if (empathyResult.length === 0) {
    throw new NotFoundError("Simulation group not found");
  }

  const toolOverride = empathyResult[0]?.empathy_tool_override;
  const promptOverride = empathyResult[0]?.empathy_prompt_override;
  let resolvedTool = toolOverride;

  if (!resolvedTool) {
    const toolResult = await sqlConnection`
      SELECT empathy_tool FROM "empathy_prompt_history"
      ORDER BY created_at DESC LIMIT 1
    `;
    resolvedTool = toolResult[0]?.empathy_tool || "CARE";
  }

  return {
    empathy_enabled: empathyResult[0].empathy_enabled !== false,
    empathy_tool: resolvedTool,
    use_global_empathy_defaults: !(toolOverride || promptOverride),
  };
}

async function getSimulationGroupVoiceConfig(sqlConnection, simulationGroupId) {
  const voiceResult = await sqlConnection`
    SELECT admin_voice_enabled, instructor_voice_enabled
    FROM "simulation_groups"
    WHERE simulation_group_id = ${simulationGroupId}
  `;

  if (voiceResult.length === 0) {
    throw new NotFoundError("Simulation group not found");
  }

  const { admin_voice_enabled, instructor_voice_enabled } = voiceResult[0];
  const voiceEnabled = admin_voice_enabled !== false && instructor_voice_enabled !== false;

  return {
    voice_enabled: voiceEnabled,
    admin_voice_enabled: admin_voice_enabled !== false,
    instructor_voice_enabled: instructor_voice_enabled !== false,
  };
}

module.exports = {
  getStudentSimulationGroups,
  getSimulationGroupsByUser,
  getInstructorGroups,
  getStudentGroupPage,
  getEnrolmentId,
  logGroupAccess,
  getSimulationGroupEmpathyConfig,
  getSimulationGroupVoiceConfig,
};
