const { getStudentVoiceEnabledConfig } = require("../services/voiceService");

const routes = {
  "GET /student/voice_enabled": async ({ event, sqlConnection, response }) => {
    const voiceConfig = await getStudentVoiceEnabledConfig(
      sqlConnection,
      event.queryStringParameters.simulation_group_id
    );
    response.statusCode = 200;
    response.body = JSON.stringify(voiceConfig);
    return response;
  },
};

module.exports = routes;
