const { getSimulationGroupVoiceConfig } = require("./groupsService");
const { NotFoundError } = require("../shared/errors");

async function getStudentVoiceEnabledConfig(sqlConnection, simulationGroupId) {
  return getSimulationGroupVoiceConfig(sqlConnection, simulationGroupId);
}

async function updateInstructorVoiceSetting(sqlConnection, simulationGroupId, instructorVoiceEnabled) {
  const result = await sqlConnection`
    UPDATE "simulation_groups"
    SET instructor_voice_enabled = ${instructorVoiceEnabled === "true"}
    WHERE simulation_group_id = ${simulationGroupId}
    RETURNING *;
  `;

  if (!result.length) {
    throw new NotFoundError("Simulation group not found");
  }

  return {
    message: "Voice settings updated successfully",
    instructor_voice_enabled: result[0].instructor_voice_enabled,
  };
}

module.exports = {
  getStudentVoiceEnabledConfig,
  updateInstructorVoiceSetting,
};
