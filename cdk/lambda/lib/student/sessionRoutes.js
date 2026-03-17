const routes = {
  "POST /student/create_session": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id &&
      event.queryStringParameters.email &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.session_name
    ) {
      const patientId = event.queryStringParameters.patient_id;
      const studentEmail = event.queryStringParameters.email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;
      const sessionName = event.queryStringParameters.session_name;

      try {
        // Step 1: Get the user ID using the student_email
        const userResult = await sqlConnection`
                SELECT user_id
                FROM "users"
                WHERE user_email = ${studentEmail}
                LIMIT 1;
            `;

        if (userResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Student not found." });
          return response;
        }

        const userId = userResult[0].user_id;

        // Step 2: Get the student_interaction_id for the specific student and patient
        const studentPatientData = await sqlConnection`
                SELECT student_interaction_id
                FROM "student_interactions"
                WHERE patient_id = ${patientId}
                  AND enrolment_id = (
                    SELECT enrolment_id
                    FROM "enrolments"
                    WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId}
                );
            `;

        const studentPatientId =
          studentPatientData[0]?.student_interaction_id;

        if (!studentPatientId) {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Student patient not found.",
          });
          return response;
        }

        // Step 3: Update the last_accessed timestamp for the student_interaction entry
        await sqlConnection`
                UPDATE "student_interactions"
                SET last_accessed = CURRENT_TIMESTAMP
                WHERE student_interaction_id = ${studentPatientId};
            `;

        // Step 4: Insert a new session with the session_name
        const sessionData = await sqlConnection`
                INSERT INTO "sessions" (session_id, student_interaction_id, session_name, session_context_embeddings, last_accessed, notes)
                VALUES (
                    uuid_generate_v4(),
                    ${studentPatientId},
                    ${sessionName},
                    ARRAY[]::float[],
                    CURRENT_TIMESTAMP,
                    NULL
                )
                RETURNING *;
            `;

        // Step 5: Log the session creation in the User Engagement Log
        const enrolmentData = await sqlConnection`
                SELECT enrolment_id
                FROM "enrolments"
                WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId};
            `;

        const enrolmentId = enrolmentData[0]?.enrolment_id;

        if (enrolmentId) {
          await sqlConnection`
                    INSERT INTO "user_engagement_log" (
                        log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
                    ) VALUES (
                        uuid_generate_v4(),
                        ${userId},
                        ${simulationGroupId},
                        ${patientId},
                        ${enrolmentId},
                        CURRENT_TIMESTAMP,
                        'session creation'
                    );
                `;
        }

        response.body = JSON.stringify(sessionData);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "Invalid value" });
    }
    return response;
  },

  "DELETE /student/delete_session": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.session_id &&
      event.queryStringParameters.email &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.patient_id
    ) {
      const sessionId = event.queryStringParameters.session_id;
      const studentEmail = event.queryStringParameters.email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;
      const patientId = event.queryStringParameters.patient_id;

      try {
        // Step 1: Get the user ID using the student_email
        const userResult = await sqlConnection`
                SELECT user_id
                FROM "users"
                WHERE user_email = ${studentEmail}
                LIMIT 1;
            `;

        if (userResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Student not found." });
          return response;
        }

        const userId = userResult[0].user_id;

        // Step 2: Update last_accessed for the corresponding student_interaction entry
        await sqlConnection`
                UPDATE "student_interactions"
                SET last_accessed = CURRENT_TIMESTAMP
                WHERE student_interaction_id = (
                    SELECT student_interaction_id
                    FROM "sessions"
                    WHERE session_id = ${sessionId}
                );
            `;

        // Step 3: Delete the session and get the result
        const deleteResult = await sqlConnection`
                DELETE FROM "sessions"
                WHERE session_id = ${sessionId}
                RETURNING *;
            `;

        if (!deleteResult.length) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Session not found." });
          return response;
        }

        // Step 4: Get the enrolment ID using user_id and simulation_group_id
        const enrolmentData = await sqlConnection`
                SELECT enrolment_id
                FROM "enrolments"
                WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId};
            `;

        if (!enrolmentData.length) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Enrolment not found." });
          return response;
        }

        const enrolmentId = enrolmentData[0].enrolment_id;

        // Step 5: Insert an entry into the User_Engagement_Log
        await sqlConnection`
                INSERT INTO "user_engagement_log" (
                    log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
                ) VALUES (
                    uuid_generate_v4(),
                    ${userId},
                    ${simulationGroupId},
                    ${patientId},
                    ${enrolmentId},
                    CURRENT_TIMESTAMP,
                    'session deletion'
                );
            `;

        response.body = JSON.stringify({ success: "Session deleted" });
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "session_id, email, simulation_group_id, and patient_id are required",
      });
    }
    return response;
  },

  "GET /student/get_messages": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.session_id
    ) {
      try {
        const sessionId = event.queryStringParameters.session_id;

        // Query to get all messages in the given session, sorted by time_sent in ascending order (oldest to newest)
        const data = await sqlConnection`
                  SELECT *
                  FROM "messages"
                  WHERE session_id = ${sessionId}
                  ORDER BY time_sent ASC;
              `;

        if (data.length > 0) {
          response.body = JSON.stringify(data);
          response.statusCode = 200;
        } else {
          response.body = JSON.stringify({
            message: "No messages found for this session.",
          });
          response.statusCode = 404;
        }
      } catch (err) {
        response.statusCode = 500;
        console.log(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "session_id is required" });
    }
    return response;
  },

  "GET /session/messages": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.session_id
    ) {
      try {
        const sessionId = event.queryStringParameters.session_id;

        // Fetch all messages in the specified session
        const messages = await sqlConnection`
                  SELECT *
                  FROM "Messages"
                  WHERE "session_id" = ${sessionId}
                  ORDER BY "time_sent" ASC;
              `;

        response.body = JSON.stringify(messages);
      } catch (err) {
        console.log(err);
        response.statusCode = 500;
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "session_id query parameter is required",
      });
    }
    return response;
  },

  "PUT /student/update_session_name": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.session_id &&
      event.body
    ) {
      try {
        const { session_id } = event.queryStringParameters;
        const { session_name } = JSON.parse(event.body);

        // If no session_name is provided, treat as no-op to avoid undefined in SQL
        if (
          session_name === undefined ||
          session_name === null ||
          (typeof session_name === "string" && session_name.trim() === "")
        ) {
          response.statusCode = 200;
          response.body = JSON.stringify({ message: "No session_name provided; session not updated" });
          return response;
        }

        const normalizedSessionName =
          typeof session_name === "string" ? session_name.trim() : session_name;

        // Update the session name
        const updateResult = await sqlConnection`
            UPDATE "sessions"
            SET session_name = ${normalizedSessionName}
            WHERE session_id = ${session_id}
            RETURNING *;
          `;

        if (updateResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Session not found" });
          return response;
        }

        response.statusCode = 200;
        response.body = JSON.stringify(updateResult[0]);
      } catch (err) {
        console.error(err);
        response.statusCode = 500;
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "Invalid value" });
    }
    return response;
  },
};

module.exports = routes;
