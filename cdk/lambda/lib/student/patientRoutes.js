const routes = {
  "GET /student/patient": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.email &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.patient_id
    ) {
      const patientId = event.queryStringParameters.patient_id;
      const studentEmail = event.queryStringParameters.email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

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
          response.body = JSON.stringify({
            error: "Student not found.",
          });
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
                )
            `;

        const studentPatientId =
          studentPatientData[0]?.student_interaction_id;

        if (!studentPatientId) {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Student patient not found",
          });
          return response;
        }

        // Step 3: Update the last accessed timestamp for the student_interactions entry
        await sqlConnection`
                UPDATE "student_interactions"
                SET last_accessed = CURRENT_TIMESTAMP
                WHERE student_interaction_id = ${studentPatientId};
            `;

        // Step 4: Retrieve session data specific to the student's patient
        const data = await sqlConnection`
                SELECT "sessions".*
                FROM "sessions"
                WHERE student_interaction_id = ${studentPatientId}
                ORDER BY "sessions".last_accessed, "sessions".session_id;
            `;

        // Step 5: Get enrolment ID for the log entry
        const enrolmentData = await sqlConnection`
                SELECT enrolment_id
                FROM "enrolments"
                WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId};
            `;

        const enrolmentId = enrolmentData[0]?.enrolment_id;

        // Step 6: Insert into User_Engagement_Log using user_id
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
                    'patient access'
                );
            `;

        response.body = JSON.stringify(data);
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

  "GET /student/patient_voice_id": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.patient_id
    ) {
      const patientId = event.queryStringParameters.patient_id;

      try {
        // Query to get the patient voice ID
        const voiceData = await sqlConnection`
                SELECT voice_id
                FROM "patients"
                WHERE patient_id = ${patientId};
            `;

        if (voiceData.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify({
            voice_id: voiceData[0].voice_id,
          });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Voice ID not found." });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "patient_id is required." });
    }
    return response;
  },

  "GET /student/patient_context": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.patient_id
    ) {
      const { simulation_group_id, patient_id } = event.queryStringParameters;

      try {
        // Get system prompt
        const systemPromptResult = await sqlConnection`
          SELECT system_prompt
          FROM "simulation_groups"
          WHERE simulation_group_id = ${simulation_group_id}
        `;

        // Get patient details
        const patientResult = await sqlConnection`
          SELECT patient_name, patient_age, patient_prompt, llm_completion
          FROM "patients"
          WHERE patient_id = ${patient_id}
        `;

        if (systemPromptResult.length === 0 || patientResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Patient or simulation group not found" });
          return response;
        }

        const context = {
          system_prompt: systemPromptResult[0].system_prompt,
          patient_name: patientResult[0].patient_name,
          patient_age: patientResult[0].patient_age,
          patient_prompt: patientResult[0].patient_prompt,
          llm_completion: patientResult[0].llm_completion
        };

        response.statusCode = 200;
        response.body = JSON.stringify(context);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "simulation_group_id and patient_id are required" });
    }
    return response;
  },
};

module.exports = routes;
