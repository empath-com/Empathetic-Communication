const { getSimulationGroupsByUser, getInstructorGroups } = require("../services/groupsService");

const routes = {
  "GET /instructor/student_group": async ({ event, sqlConnection, response }) => {
    const email = event.queryStringParameters.email;
    const data = await getSimulationGroupsByUser(sqlConnection, email);
    response.statusCode = 200;
    response.body = JSON.stringify(data);
    return response;
  },

  "GET /instructor/groups": async ({ event, sqlConnection, response }) => {
    const instructorEmail = event.queryStringParameters.email;
    const data = await getInstructorGroups(sqlConnection, instructorEmail);
    response.statusCode = 200;
    response.body = JSON.stringify(data);
    return response;
  },

  "PUT /instructor/update_metadata": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id &&
      event.queryStringParameters.filename &&
      event.queryStringParameters.filetype
    ) {
      const patient_id = event.queryStringParameters.patient_id;
      const filename = event.queryStringParameters.filename;
      const filetype = event.queryStringParameters.filetype;
      const { metadata } = JSON.parse(event.body);

      try {
        // Query to find the file with the given patient_id and filename
        const existingFile = await sqlConnection`
                  SELECT * FROM "patient_data"
                  WHERE patient_id = ${patient_id}
                  AND filename = ${filename}
                  AND filetype = ${filetype};
              `;

        if (existingFile.length === 0) {
          const result = await sqlConnection`
            INSERT INTO "patient_data" (patient_id, filename, filetype, metadata)
            VALUES (${patient_id}, ${filename}, ${filetype}, ${metadata})
            RETURNING *;
          `;
          response.body = JSON.stringify({
            message: "File metadata added successfully",
          });
        }

        // Update the metadata field
        const result = await sqlConnection`
                  UPDATE "patient_data"
                  SET metadata = ${metadata}
                  WHERE patient_id = ${patient_id}
                  AND filename = ${filename}
                  AND filetype = ${filetype}
                  RETURNING *;
              `;

        if (result.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify(result[0]);
        } else {
          response.statusCode = 500;
          response.body = JSON.stringify({
            error: "Failed to update metadata.",
          });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "patient_id and filename are required",
      });
    }
    return response;
  },
};

module.exports = routes;
