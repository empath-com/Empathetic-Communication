const routes = {
  "GET /instructor/get_completion_status": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.student_email &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { student_email, simulation_group_id } =
        event.queryStringParameters;

      try {
        // Step 1: Get the user_id from the student's email
        const userResult = await sqlConnection`
          SELECT user_id FROM "users" WHERE user_email = ${student_email} LIMIT 1;
        `;

        const userId = userResult[0]?.user_id;

        if (!userId) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Student not found" });
          return response;
        }

        // Step 2: Fetch all interactions with completion status for the specified simulation group
        const completionStatus = await sqlConnection`
          SELECT si.student_interaction_id, si.is_completed, p.patient_name
          FROM "student_interactions" si
          JOIN "patients" p ON si.patient_id = p.patient_id
          JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
          WHERE e.user_id = ${userId} AND e.simulation_group_id = ${simulation_group_id}
          ORDER BY p.patient_name;
        `;

        response.statusCode = 200;
        response.body = JSON.stringify(completionStatus);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "student_email and simulation_group_id are required",
      });
    }
    return response;
  },

  "PUT /instructor/toggle_completion": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.student_interaction_id
    ) {
      const { student_interaction_id } = event.queryStringParameters;

      try {
        // Get the current completion status
        const result = await sqlConnection`
          SELECT is_completed FROM "student_interactions" WHERE student_interaction_id = ${student_interaction_id};
        `;

        if (result.length > 0) {
          const newStatus = !result[0].is_completed;

          // Update the status to the opposite value
          await sqlConnection`
            UPDATE "student_interactions"
            SET is_completed = ${newStatus}
            WHERE student_interaction_id = ${student_interaction_id};
          `;

          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "Completion status updated",
            is_completed: newStatus,
          });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Interaction not found",
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
        error: "student_interaction_id is required",
      });
    }
    return response;
  },

  "PUT /instructor/toggle_llm_completion": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id
    ) {
      const { patient_id } = event.queryStringParameters;

      try {
        // Retrieve the current llm_completion status for the patient
        const result = await sqlConnection`
                SELECT llm_completion FROM "patients" WHERE patient_id = ${patient_id};
            `;

        if (result.length > 0) {
          // Toggle the llm_completion value
          const newStatus = !result[0].llm_completion;

          // Update the status to the opposite value in the database
          await sqlConnection`
                    UPDATE "patients"
                    SET llm_completion = ${newStatus}
                    WHERE patient_id = ${patient_id};
                `;

          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "LLM completion status updated",
            llm_completion: newStatus,
          });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Patient not found" });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "patient_id is required" });
    }
    return response;
  },

  "GET /instructor/ingestion_status": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { patient_id, simulation_group_id } =
        event.queryStringParameters;

      try {
        // Query patient_data table to fetch filenames and ingestion_status for documents
        const ingestionStatusData = await sqlConnection`
                SELECT filename, filetype, ingestion_status
                FROM "patient_data"
                WHERE patient_id = ${patient_id}
                AND filepath LIKE ${
                  simulation_group_id + "/" + patient_id + "/documents/%"
                };
            `;

        // Convert the results to a hashmap
        const ingestionStatusMap = {};
        ingestionStatusData.forEach((row) => {
          ingestionStatusMap[row.filename + "." + row.filetype] =
            row.ingestion_status;
        });

        response.statusCode = 200;
        response.body = JSON.stringify(ingestionStatusMap);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "patient_id and simulation_group_id are required",
      });
    }
    return response;
  },
};

module.exports = routes;
