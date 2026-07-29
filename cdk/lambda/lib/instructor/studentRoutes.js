const { getUserIdByEmail } = require("../services/usersService");

const routes = {
  "GET /instructor/view_students": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { simulation_group_id } = event.queryStringParameters;

      try {
        // Query to get all students enrolled in the given simulation group
        const enrolledStudents = await sqlConnection`
          SELECT u.user_email, u.username, u.first_name, u.last_name
          FROM "enrolments" e
          JOIN "users" u ON e.user_id = u.user_id
          WHERE e.simulation_group_id = ${simulation_group_id}
            AND e.enrolment_type = 'student';
        `;

        response.statusCode = 200;
        response.body = JSON.stringify(enrolledStudents);
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

  "DELETE /instructor/delete_student": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.instructor_email &&
      event.queryStringParameters.user_email
    ) {
      const { simulation_group_id, instructor_email, user_email } =
        event.queryStringParameters;

      try {
        const userId = await getUserIdByEmail(sqlConnection, user_email);

        // Step 2: Delete the student from the simulation group enrolments
        const deleteResult = await sqlConnection`
          DELETE FROM "enrolments"
          WHERE simulation_group_id = ${simulation_group_id}
            AND user_id = ${userId}
            AND enrolment_type = 'student'
          RETURNING *;
        `;

        if (deleteResult.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify(deleteResult[0]);

          // Step 3: Insert into User Engagement Log
          await sqlConnection`
            INSERT INTO "user_engagement_log" (
              log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
            )
            VALUES (
              uuid_generate_v4(), ${userId}, ${simulation_group_id}, null, null,
              CURRENT_TIMESTAMP, 'instructor_deleted_student'
            );
          `;
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Student not found in the simulation group",
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
        error:
          "simulation_group_id, user_email, and instructor_email are required",
      });
    }
    return response;
  },

  "GET /instructor/view_student_messages": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.student_email &&
      event.queryStringParameters.simulation_group_id
    ) {
      const studentEmail = event.queryStringParameters.student_email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

      try {
        const userId = await getUserIdByEmail(sqlConnection, studentEmail);

        // Step 2: Query to get the student's messages for a specific simulation group
        const messages = await sqlConnection`
          SELECT m.message_content, m.time_sent, m.student_sent
          FROM "messages" m
          JOIN "sessions" s ON m.session_id = s.session_id
          JOIN "student_interactions" sp ON s.student_interaction_id = sp.student_interaction_id
          JOIN "enrolments" e ON sp.enrolment_id = e.enrolment_id
          WHERE e.user_id = ${userId}
          AND e.simulation_group_id = ${simulationGroupId}
          ORDER BY m.time_sent;
        `;

        response.statusCode = 200;
        response.body = JSON.stringify(messages);
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

  "GET /instructor/student_patients_messages": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.student_email &&
      event.queryStringParameters.simulation_group_id
    ) {
      const studentEmail = event.queryStringParameters.student_email;
      const simulationGroupId =
        event.queryStringParameters.simulation_group_id;

      try {
        const userId = await getUserIdByEmail(sqlConnection, studentEmail);

        // Step 2: Get all patients linked to the student under the given simulation group
        const studentPatients = await sqlConnection`
                SELECT p.patient_id, p.patient_name, p.patient_number
                FROM "student_interactions" si
                JOIN "patients" p ON si.patient_id = p.patient_id
                JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
                WHERE e.user_id = ${userId} AND e.simulation_group_id = ${simulationGroupId}
                ORDER BY p.patient_number;
            `;

        const result = {};

        // Step 3: Iterate through the patients and get sessions for each patient
        for (const patient of studentPatients) {
          const sessions = await sqlConnection`
                    SELECT s.session_id, s.session_name, s.notes
                    FROM "sessions" s
                    WHERE s.student_interaction_id IN (
                        SELECT student_interaction_id
                        FROM "student_interactions"
                        WHERE patient_id = ${patient.patient_id} AND enrolment_id IN (
                            SELECT enrolment_id
                            FROM "enrolments"
                            WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId}
                        )
                    );
                `;

          result[patient.patient_name] = [];

          // Step 4: For each session, retrieve the messages and notes
          for (const session of sessions) {
            const messages = await sqlConnection`
                        SELECT student_sent, message_content, time_sent
                        FROM "messages"
                        WHERE session_id = ${session.session_id}
                        ORDER BY time_sent ASC;
                    `;

            result[patient.patient_name].push({
              sessionName: session.session_name,
              notes: session.notes || "No notes available.",
              messages: messages.map((msg) => ({
                student_sent: msg.student_sent,
                message_content: msg.message_content,
                time_sent: msg.time_sent,
              })),
            });
          }
        }

        // Step 5: Return the response
        response.body = JSON.stringify(result);
      } catch (err) {
        console.error(err);
        response.statusCode = 500;
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
