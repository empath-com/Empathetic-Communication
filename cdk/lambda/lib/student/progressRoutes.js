const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const lambdaClient = new LambdaClient({});

const routes = {
  "POST /student/update_patient_score": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id &&
      event.queryStringParameters.student_email &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.llm_verdict
    ) {
      try {
        const patientId = event.queryStringParameters.patient_id;
        const studentEmail = event.queryStringParameters.student_email;
        const simulationGroupId =
          event.queryStringParameters.simulation_group_id;
        const llmVerdict =
          event.queryStringParameters.llm_verdict === "true"; // Convert to boolean

        // Retrieve user_id from the Users table
        const userData = await sqlConnection`
                SELECT user_id
                FROM "users"
                WHERE user_email = ${studentEmail};
            `;

        const userId = userData[0]?.user_id;

        if (!userId) {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "User not found",
          });
          return response;
        }

        // Get the student_interaction_id and current score for the student and patient
        const studentPatientData = await sqlConnection`
                SELECT student_interaction_id, patient_score
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
        const currentScore = studentPatientData[0]?.patient_score;

        if (!studentPatientId) {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Student patient entry not found.",
          });
          return response;
        }

        // If llm_verdict is false and the current score is 100, no update is needed
        if (!llmVerdict && currentScore === 100) {
          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "No changes made. Patient score is already 100.",
          });
          return response;
        }

        // Determine the new score based on llm_verdict
        const newScore = llmVerdict ? 100 : 0;

        // Update the patient score for the student
        await sqlConnection`
                UPDATE "student_interactions"
                SET patient_score = ${newScore}
                WHERE student_interaction_id = ${studentPatientId};
            `;

        response.statusCode = 200;
        response.body = JSON.stringify({
          message: "Patient score updated successfully.",
        });
      } catch (err) {
        console.error(err);
        response.statusCode = 500;
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "Invalid query parameters.",
      });
    }
    return response;
  },

  "GET /student/get_completion_status": async ({ event, sqlConnection, response }) => {
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

  "POST /student/record_session_activity": async ({ event, sqlConnection, response }) => {
    const { session_id, student_email, simulation_group_id } =
      event.queryStringParameters || {};
    const { active_seconds } = JSON.parse(event.body || "{}");
    const activeSeconds = Number(active_seconds);

    if (!Number.isInteger(activeSeconds) || activeSeconds < 1 || activeSeconds > 120) {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "active_seconds must be an integer from 1 to 120" });
      return response;
    }

    try {
      const updatedSession = await sqlConnection`
        UPDATE sessions s
        SET active_duration_seconds = s.active_duration_seconds + ${activeSeconds},
            last_activity_at = CURRENT_TIMESTAMP,
            last_accessed = CURRENT_TIMESTAMP
        FROM student_interactions si
        JOIN enrolments e ON si.enrolment_id = e.enrolment_id
        JOIN users u ON e.user_id = u.user_id
        WHERE s.session_id = ${session_id}
          AND s.student_interaction_id = si.student_interaction_id
          AND u.user_email = ${student_email}
          AND e.simulation_group_id = ${simulation_group_id}
          AND s.completion_status = 'in_progress'
        RETURNING s.session_id, s.active_duration_seconds, s.last_activity_at;
      `;

      if (!updatedSession.length) {
        response.statusCode = 404;
        response.body = JSON.stringify({ error: "Active session not found" });
        return response;
      }

      response.statusCode = 200;
      response.body = JSON.stringify(updatedSession[0]);
    } catch (err) {
      response.statusCode = 500;
      console.error(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
    return response;
  },

  "POST /student/complete_session": async ({ event, sqlConnection, response }) => {
    const { session_id, student_email, simulation_group_id } =
      event.queryStringParameters || {};
    const { objective_achieved } = JSON.parse(event.body || "{}");

    if (typeof objective_achieved !== "boolean") {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "objective_achieved must be a boolean" });
      return response;
    }

    try {
      const completedSession = await sqlConnection`
        WITH owned_session AS (
          SELECT s.session_id, si.student_interaction_id
          FROM sessions s
          JOIN student_interactions si ON s.student_interaction_id = si.student_interaction_id
          JOIN enrolments e ON si.enrolment_id = e.enrolment_id
          JOIN users u ON e.user_id = u.user_id
          WHERE s.session_id = ${session_id}
            AND u.user_email = ${student_email}
            AND e.simulation_group_id = ${simulation_group_id}
        ), updated_session AS (
          UPDATE sessions s
          SET completion_status = 'completed',
              completed_at = COALESCE(s.completed_at, CURRENT_TIMESTAMP),
              last_activity_at = CURRENT_TIMESTAMP,
              last_accessed = CURRENT_TIMESTAMP
          FROM owned_session os
          WHERE s.session_id = os.session_id
          RETURNING s.session_id, os.student_interaction_id, s.completed_at
        ), updated_interaction AS (
          UPDATE student_interactions si
          SET patient_score = CASE
            WHEN ${objective_achieved} THEN 100
            ELSE si.patient_score
          END
          FROM updated_session us
          WHERE si.student_interaction_id = us.student_interaction_id
        ), analytics_job AS (
          INSERT INTO conversation_analytics_jobs (session_id, status)
          SELECT session_id, 'pending' FROM updated_session
          ON CONFLICT (session_id) DO NOTHING
        )
        SELECT
          session_id,
          completed_at
        FROM updated_session;
      `;

      if (!completedSession.length) {
        response.statusCode = 404;
        response.body = JSON.stringify({ error: "Session not found" });
        return response;
      }

      const analyticsJob = await sqlConnection`
        SELECT status FROM conversation_analytics_jobs WHERE session_id = ${session_id};
      `;
      const analyticsStatus = analyticsJob[0]?.status || "pending";

      if (analyticsStatus === "pending" && process.env.TEXT_GEN_FUNCTION_NAME) {
        try {
          await lambdaClient.send(
            new InvokeCommand({
              FunctionName: process.env.TEXT_GEN_FUNCTION_NAME,
              InvocationType: "Event",
              Payload: Buffer.from(JSON.stringify({
                conversationAnalytics: true,
                session_id,
              })),
            })
          );
        } catch (error) {
          console.error("Failed to start conversation analytics:", error);
        }
      }

      response.statusCode = 200;
      response.body = JSON.stringify({
        session_id: completedSession[0].session_id,
        completed_at: completedSession[0].completed_at,
        objective_achieved,
        analytics_status: analyticsStatus,
      });
    } catch (err) {
      response.statusCode = 500;
      console.error(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
    return response;
  },
};

module.exports = routes;
