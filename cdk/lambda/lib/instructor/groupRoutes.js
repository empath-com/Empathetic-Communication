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

  "GET /instructor/analytics": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id
    ) {
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

      try {
        // Query to get all patients and their message counts, separated by student and AI messages
        const messageCreations = await sqlConnection`
                SELECT p.patient_id, p.patient_name, p.patient_number,
                    COUNT(CASE WHEN m.student_sent THEN 1 ELSE NULL END) AS student_message_count,
                    COUNT(CASE WHEN NOT m.student_sent THEN 1 ELSE NULL END) AS ai_message_count
                FROM "patients" p
                LEFT JOIN "student_interactions" sp ON p.patient_id = sp.patient_id
                LEFT JOIN "sessions" s ON sp.student_interaction_id = s.student_interaction_id
                LEFT JOIN "messages" m ON s.session_id = m.session_id
                LEFT JOIN "enrolments" e ON sp.enrolment_id = e.enrolment_id
                LEFT JOIN "users" u ON e.user_id = u.user_id
                WHERE p.simulation_group_id = ${simulationGroupId}
                AND 'student' = ANY(u.roles)
                GROUP BY p.patient_id, p.patient_name, p.patient_number
                ORDER BY p.patient_number ASC, p.patient_name ASC;
            `;

        // Query to get the number of patient accesses using User_Engagement_Log, filtering by student role
        const patientAccesses = await sqlConnection`
                SELECT p.patient_id, COUNT(uel.log_id) AS access_count
                FROM "patients" p
                LEFT JOIN "user_engagement_log" uel ON p.patient_id = uel.patient_id
                LEFT JOIN "enrolments" e ON uel.enrolment_id = e.enrolment_id
                LEFT JOIN "users" u ON e.user_id = u.user_id
                WHERE p.simulation_group_id = ${simulationGroupId}
                AND uel.engagement_type = 'patient access'
                AND 'student' = ANY(u.roles)
                GROUP BY p.patient_id;
            `;

        // Query to get the percentage of scores evaluated by the LLM for each patient, filtering by student role
        const aiScores = await sqlConnection`
                SELECT p.patient_id, p.llm_completion,
                    CASE
                        WHEN COUNT(sp.student_interaction_id) = 0 THEN 0
                        ELSE COUNT(CASE WHEN sp.patient_score = 100 THEN 1 END) * 100.0 / COUNT(sp.student_interaction_id)
                    END AS ai_score_percentage
                FROM "patients" p
                LEFT JOIN "student_interactions" sp ON p.patient_id = sp.patient_id
                LEFT JOIN "enrolments" e ON sp.enrolment_id = e.enrolment_id
                LEFT JOIN "users" u ON e.user_id = u.user_id
                WHERE p.simulation_group_id = ${simulationGroupId}
                AND 'student' = ANY(u.roles)
                GROUP BY p.patient_id;
            `;

        // Query to calculate the percentage of completed interactions for each patient, filtering by student role
        const instructorCompletionPercentages = await sqlConnection`
                SELECT
                    p.patient_id,
                    CASE
                        WHEN COUNT(sp.student_interaction_id) = 0 THEN 0
                        ELSE COUNT(CASE WHEN sp.is_completed THEN 1 END) * 100.0 / COUNT(sp.student_interaction_id)
                    END AS instructor_completion_percentage
                FROM "patients" p
                LEFT JOIN "student_interactions" sp ON p.patient_id = sp.patient_id
                LEFT JOIN "enrolments" e ON sp.enrolment_id = e.enrolment_id
                LEFT JOIN "users" u ON e.user_id = u.user_id
                WHERE p.simulation_group_id = ${simulationGroupId}
                AND 'student' = ANY(u.roles)
                GROUP BY p.patient_id;
            `;

        // Combine all data into a single response, ensuring all patients are included
        const analyticsData = messageCreations.map((patient) => {
          const accesses =
            patientAccesses.find(
              (pa) => pa.patient_id === patient.patient_id
            ) || {};
          const aiScore =
            aiScores.find((ps) => ps.patient_id === patient.patient_id) ||
            {};
          const instructorCompletionData =
            instructorCompletionPercentages.find(
              (cp) => cp.patient_id === patient.patient_id
            ) || {};

          return {
            patient_id: patient.patient_id,
            patient_name: patient.patient_name,
            patient_number: patient.patient_number,
            student_message_count: patient.student_message_count || 0,
            ai_message_count: patient.ai_message_count || 0,
            access_count: accesses.access_count || 0,
            ai_score_percentage:
              parseFloat(aiScore.ai_score_percentage) || 0,
            llm_completion: aiScore.llm_completion || false,
            instructor_completion_percentage:
              parseFloat(
                instructorCompletionData.instructor_completion_percentage
              ) || 0,
          };
        });

        response.statusCode = 200;
        response.body = JSON.stringify(analyticsData);
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
