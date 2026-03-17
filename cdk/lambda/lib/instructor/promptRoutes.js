const routes = {
  "PUT /instructor/prompt": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.instructor_email &&
      event.body
    ) {
      try {
        const { simulation_group_id, instructor_email } =
          event.queryStringParameters;
        const { prompt } = JSON.parse(event.body);

        // Retrieve the current system prompt
        const currentPromptResult = await sqlConnection`
          SELECT system_prompt
          FROM "simulation_groups"
          WHERE simulation_group_id = ${simulation_group_id};
        `;

        if (currentPromptResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Simulation Group not found",
          });
          return response;
        }

        const oldPrompt = currentPromptResult[0].system_prompt;

        // Update the system prompt for the simulation group
        const updatedGroup = await sqlConnection`
          UPDATE "simulation_groups"
          SET system_prompt = ${prompt}
          WHERE simulation_group_id = ${simulation_group_id}
          RETURNING *;
        `;

        // Log the change in the User Engagement Log with the old prompt
        await sqlConnection`
          INSERT INTO "user_engagement_log" (
            log_id,
            user_id,
            simulation_group_id,
            patient_id,
            enrolment_id,
            timestamp,
            engagement_type,
            engagement_details
          )
          VALUES (
            uuid_generate_v4(),
            (SELECT user_id FROM "users" WHERE user_email = ${instructor_email}),
            ${simulation_group_id},
            null,
            null,
            CURRENT_TIMESTAMP,
            'instructor_updated_prompt',
            ${oldPrompt}
          );
        `;

        response.statusCode = 200;
        response.body = JSON.stringify(updatedGroup[0]);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "simulation_group_id, instructor_email, or request body is missing",
      });
    }
    return response;
  },

  "GET /instructor/get_prompt": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id
    ) {
      try {
        const { simulation_group_id } = event.queryStringParameters;

        // Retrieve the system prompt from the simulation_groups table
        const groupPrompt = await sqlConnection`
          SELECT system_prompt
          FROM "simulation_groups"
          WHERE simulation_group_id = ${simulation_group_id};
        `;

        if (groupPrompt.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify(groupPrompt[0]);
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Simulation group not found",
          });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = "simulation_group_id is missing";
    }
    return response;
  },

  "GET /instructor/previous_prompts": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.instructor_email
    ) {
      try {
        const { simulation_group_id, instructor_email } =
          event.queryStringParameters;

        // Query to get all previous prompts for the given simulation group and instructor
        const previousPrompts = await sqlConnection`
          SELECT timestamp, engagement_details AS previous_prompt
          FROM "user_engagement_log"
          WHERE simulation_group_id = ${simulation_group_id}
            AND engagement_type = 'instructor_updated_prompt'
          ORDER BY timestamp DESC;
        `;

        response.body = JSON.stringify(previousPrompts);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "simulation_group_id or instructor_email query parameter is required",
      });
    }
    return response;
  },
};

module.exports = routes;
