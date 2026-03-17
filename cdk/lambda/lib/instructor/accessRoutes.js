const routes = {
  "PUT /instructor/generate_access_code": async ({ event, sqlConnection, response, generateAccessCode }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id
    ) {
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

      try {
        const newAccessCode = generateAccessCode();

        // Update the access code in the simulation_groups table
        const updatedGroup = await sqlConnection`
          UPDATE "simulation_groups"
          SET group_access_code = ${newAccessCode}
          WHERE simulation_group_id = ${simulationGroupId}
          RETURNING *;
        `;

        response.statusCode = 200;
        response.body = JSON.stringify({
          message: "Access code generated successfully",
          access_code: newAccessCode,
        });
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "simulation_group_id is required",
      });
    }
    return response;
  },

  "GET /instructor/get_access_code": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id
    ) {
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

      try {
        // Query to get the access code
        const accessCode = await sqlConnection`
          SELECT group_access_code
          FROM "simulation_groups"
          WHERE simulation_group_id = ${simulationGroupId};
        `;

        response.statusCode = 200;
        response.body = JSON.stringify(accessCode[0]);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "simulation_group_id is required",
      });
    }
    return response;
  },
};

module.exports = routes;
