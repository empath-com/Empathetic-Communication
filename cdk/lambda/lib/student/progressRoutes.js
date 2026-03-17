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
};

module.exports = routes;
