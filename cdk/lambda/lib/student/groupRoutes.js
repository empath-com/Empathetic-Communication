const routes = {
  "GET /student/simulation_group": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.email
    ) {
      const user_email = event.queryStringParameters.email;

      try {
        // Retrieve the user ID using the user_email
        const userResult = await sqlConnection`
            SELECT user_id FROM "users" WHERE user_email = ${user_email};
          `;

        if (userResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "User not found" });
          return response;
        }

        const user_id = userResult[0].user_id;

        // Query to get simulation groups for the user
        const data = await sqlConnection`
            SELECT "simulation_groups".*
            FROM "enrolments"
            JOIN "simulation_groups" ON "simulation_groups".simulation_group_id = "enrolments".simulation_group_id
            WHERE "enrolments".user_id = ${user_id}
            AND "simulation_groups".group_student_access = TRUE
            ORDER BY "simulation_groups".group_name, "simulation_groups".simulation_group_id;
          `;
        response.body = JSON.stringify(data);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = "Invalid value";
    }
    return response;
  },

  "GET /student/simulation_group_page": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.email &&
      event.queryStringParameters.simulation_group_id
    ) {
      const studentEmail = event.queryStringParameters.email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

      try {
        // Retrieve the user ID using the user_email
        const userResult = await sqlConnection`
            SELECT user_id FROM "users" WHERE user_email = ${studentEmail};
          `;

        if (userResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "User not found" });
          return response;
        }

        const userId = userResult[0].user_id;

        // Fetch patient data associated with the simulation group
        const data = await sqlConnection`
            WITH StudentEnrollment AS (
              SELECT
                enrolment_id
              FROM
                "enrolments"
              WHERE
                user_id = ${userId}
                AND simulation_group_id = ${simulationGroupId}
              LIMIT 1
            )
            SELECT
              p.patient_id,
              p.patient_name,
              p.patient_age,
              p.patient_gender,
              p.patient_number,
              p.llm_completion,
              sp.student_interaction_id,
              sp.patient_score,
              sp.last_accessed,
              sp.patient_context_embedding,
              sp.is_completed
            FROM
              "patients" p
            LEFT JOIN
              "student_interactions" sp ON sp.patient_id = p.patient_id
            JOIN
              StudentEnrollment se ON sp.enrolment_id = se.enrolment_id
            WHERE
              p.simulation_group_id = ${simulationGroupId}
            ORDER BY
              p.patient_number;
          `;

        const enrolmentId = data[0]?.enrolment_id;

        if (enrolmentId) {
          await sqlConnection`
              INSERT INTO "user_engagement_log" (
                log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
              ) VALUES (
                uuid_generate_v4(), ${userId}, ${simulationGroupId}, null, ${enrolmentId}, CURRENT_TIMESTAMP, 'group access'
              );
            `;
        }

        response.body = JSON.stringify(data);
      } catch (err) {
        response.statusCode = 500;
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = "Invalid value";
    }
    return response;
  },
};

module.exports = routes;
