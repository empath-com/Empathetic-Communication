const { getStudentEmpathyEnabledConfig } = require("../services/empathyService");

const routes = {
  "GET /student/empathy_summary": async ({ event, sqlConnection, response }) => {
    // Import the studentEmpathySummary handler
    const studentEmpathySummary = require('../studentEmpathySummary');
    // Call the handler and return its response
    const empathySummaryResponse = await studentEmpathySummary(event, sqlConnection);
    response.statusCode = empathySummaryResponse.statusCode;
    response.body = empathySummaryResponse.body;
    return response;
  },

  "GET /student/empathy_enabled": async ({ event, sqlConnection, response }) => {
    const config = await getStudentEmpathyEnabledConfig(
      sqlConnection,
      event.queryStringParameters.simulation_group_id
    );
    response.statusCode = 200;
    response.body = JSON.stringify(config);
    return response;
  },
};

module.exports = routes;
