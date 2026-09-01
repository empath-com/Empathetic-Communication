const {
  getPollyVoices,
  synthesizeVoiceSample,
  updateInstructorVoiceSetting,
} = require("../services/voiceService");

const routes = {
  "GET /instructor/polly_voices": async ({ response }) => {
    response.statusCode = 200;
    response.body = JSON.stringify({ voices: await getPollyVoices() });
    return response;
  },

  "POST /instructor/voice_sample": async ({ event, response }) => {
    const { voice_id: voiceId } = JSON.parse(event.body || "{}");
    response.statusCode = 200;
    response.body = JSON.stringify(await synthesizeVoiceSample(voiceId));
    return response;
  },

  "POST /instructor/update_voice_settings": async ({ event, sqlConnection, response }) => {
    const { simulation_group_id, instructor_voice_enabled } = event.queryStringParameters;
    const result = await updateInstructorVoiceSetting(
      sqlConnection,
      simulation_group_id,
      instructor_voice_enabled
    );
    response.statusCode = 200;
    response.body = JSON.stringify(result);
    return response;
  },
};

module.exports = routes;
