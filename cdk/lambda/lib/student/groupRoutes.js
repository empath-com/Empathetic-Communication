const {
  getStudentSimulationGroups,
  getStudentGroupPage,
  getEnrolmentId,
  logGroupAccess,
} = require("../services/groupsService");

const routes = {
  "GET /student/simulation_group": async ({ event, sqlConnection, response }) => {
    const userEmail = event.queryStringParameters.email;
    const data = await getStudentSimulationGroups(sqlConnection, userEmail);
    response.statusCode = 200;
    response.body = JSON.stringify(data);
    return response;
  },

  "GET /student/simulation_group_page": async ({ event, sqlConnection, response }) => {
    const studentEmail = event.queryStringParameters.email;
    const simulationGroupId = event.queryStringParameters.simulation_group_id;

    const { userId, data } = await getStudentGroupPage(
      sqlConnection,
      studentEmail,
      simulationGroupId
    );

    const enrolmentId = await getEnrolmentId(sqlConnection, userId, simulationGroupId);
    await logGroupAccess(sqlConnection, userId, simulationGroupId, enrolmentId);

    response.statusCode = 200;
    response.body = JSON.stringify(data);
    return response;
  },
};

module.exports = routes;
