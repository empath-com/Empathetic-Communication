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
    if (
      event.queryStringParameters &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { simulation_group_id } = event.queryStringParameters;

      try {
        // Get empathy_enabled and optional per-group empathy tool override.
        const empathyResult = await sqlConnection`
          SELECT empathy_enabled, empathy_tool_override, empathy_prompt_override
          FROM "simulation_groups"
          WHERE simulation_group_id = ${simulation_group_id}
        `;

        if (empathyResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Simulation group not found" });
          return response;
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

        response.statusCode = 200;
        response.body = JSON.stringify({
          empathy_enabled: empathyResult[0].empathy_enabled !== false,
          empathy_tool: resolvedTool,
          use_global_empathy_defaults: !(toolOverride || promptOverride),
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
