const { getSimulationGroupEmpathyConfig } = require("./groupsService");

async function getStudentEmpathyEnabledConfig(sqlConnection, simulationGroupId) {
  return getSimulationGroupEmpathyConfig(sqlConnection, simulationGroupId);
}

module.exports = {
  getStudentEmpathyEnabledConfig,
};
