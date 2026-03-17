const routes = {
  "GET /student/voice_enabled": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { simulation_group_id } = event.queryStringParameters;

      try {
        // Get voice settings for the simulation group
        const voiceResult = await sqlConnection`
          SELECT admin_voice_enabled, instructor_voice_enabled
          FROM "simulation_groups"
          WHERE simulation_group_id = ${simulation_group_id}
        `;

        if (voiceResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Simulation group not found" });
          return response;
        }

        const { admin_voice_enabled, instructor_voice_enabled } = voiceResult[0];

        // Voice is enabled only if both admin and instructor toggles are enabled
        const voiceEnabled = admin_voice_enabled !== false && instructor_voice_enabled !== false;

        response.statusCode = 200;
        response.body = JSON.stringify({
          voice_enabled: voiceEnabled,
          admin_voice_enabled: admin_voice_enabled !== false,
          instructor_voice_enabled: instructor_voice_enabled !== false
        });
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "simulation_group_id is required" });
    }
    return response;
  },
};

module.exports = routes;
