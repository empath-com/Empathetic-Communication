const routes = {
  "POST /student/create_message": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.session_id &&
      event.queryStringParameters.email &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.patient_id &&
      event.body
    ) {
      const sessionId = event.queryStringParameters.session_id;
      const { message_content } = JSON.parse(event.body);
      const studentEmail = event.queryStringParameters.email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;
      const patientId = event.queryStringParameters.patient_id;

      try {
        // Insert the new message into the Messages table with a generated UUID for message_id
        const messageData = await sqlConnection`
                  INSERT INTO "messages" (message_id, session_id, student_sent, message_content, empathy_evaluation, time_sent)
                  VALUES (uuid_generate_v4(), ${sessionId}, true, ${message_content}, NULL, CURRENT_TIMESTAMP)
                  RETURNING *;
              `;

        // Update the last_accessed field in the Sessions table
        await sqlConnection`
                  UPDATE "sessions"
                  SET last_accessed = CURRENT_TIMESTAMP
                  WHERE session_id = ${sessionId};
              `;

        // Retrieve user_id based on studentEmail
        const userData = await sqlConnection`
                  SELECT user_id
                  FROM "users"
                  WHERE user_email = ${studentEmail};
              `;

        const userId = userData[0]?.user_id;

        if (userId) {
          // Retrieve the enrolment ID using user_id
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
                          )
                          VALUES (
                              uuid_generate_v4(),
                              ${userId},
                              ${simulationGroupId},
                              ${patientId},
                              ${enrolmentId},
                              CURRENT_TIMESTAMP,
                              'message creation'
                          );
                      `;
          }
        }

        response.body = JSON.stringify(messageData);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "session_id and message_content are required",
      });
    }
    return response;
  },

  "POST /student/create_ai_message": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.session_id &&
      event.queryStringParameters.email &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.patient_id &&
      event.body
    ) {
      const sessionId = event.queryStringParameters.session_id;
      const { message_content } = JSON.parse(event.body);
      const studentEmail = event.queryStringParameters.email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;
      const patientId = event.queryStringParameters.patient_id;

      try {
        // Insert the new AI message into the Messages table with a generated UUID for message_id
        const messageData = await sqlConnection`
                  INSERT INTO "messages" (message_id, session_id, student_sent, message_content, empathy_evaluation, time_sent)
                  VALUES (uuid_generate_v4(), ${sessionId}, false, ${message_content}, NULL, CURRENT_TIMESTAMP)
                  RETURNING *;
              `;

        // Update the last_accessed field in the Sessions table
        await sqlConnection`
                  UPDATE "sessions"
                  SET last_accessed = CURRENT_TIMESTAMP
                  WHERE session_id = ${sessionId};
              `;

        // Retrieve user_id based on studentEmail
        const userData = await sqlConnection`
                  SELECT user_id
                  FROM "users"
                  WHERE user_email = ${studentEmail};
              `;

        const userId = userData[0]?.user_id;

        if (userId) {
          // Retrieve the enrolment ID using user_id
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
                          )
                          VALUES (
                              uuid_generate_v4(),
                              ${userId},
                              ${simulationGroupId},
                              ${patientId},
                              ${enrolmentId},
                              CURRENT_TIMESTAMP,
                              'AI message creation'
                          );
                      `;
          }
        }

        response.body = JSON.stringify(messageData);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "session_id and message_content are required",
      });
    }
    return response;
  },
};

module.exports = routes;
