const routes = {
  "POST /instructor/update_voice_settings": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.instructor_voice_enabled
    ) {
      const { simulation_group_id, instructor_voice_enabled } = event.queryStringParameters;

      try {
        // Update the instructor voice setting
        const result = await sqlConnection`
          UPDATE "simulation_groups"
          SET instructor_voice_enabled = ${instructor_voice_enabled === 'true'}
          WHERE simulation_group_id = ${simulation_group_id}
          RETURNING *;
        `;

        if (result.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "Voice settings updated successfully",
            instructor_voice_enabled: result[0].instructor_voice_enabled
          });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Simulation group not found" });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "simulation_group_id and instructor_voice_enabled are required"
      });
    }
    return response;
  },
};

module.exports = routes;
