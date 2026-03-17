const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

let { USER_POOL } = process.env;

const routes = {
  "POST /student/enroll_student": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.student_email &&
      event.queryStringParameters.group_access_code
    ) {
      const { student_email, group_access_code } =
        event.queryStringParameters;

      try {
        // Step 1: Retrieve or create the user ID using the student_email
        let userResult = await sqlConnection`
              SELECT user_id
              FROM "users"
              WHERE user_email = ${student_email}
              LIMIT 1;
          `;

        let user_id;

        if (userResult.length === 0) {
          // User exists in Cognito but not in database - create them
          console.log(`Creating database record for authenticated user: ${student_email}`);

          try {
            const cognito_id = event.requestContext.authorizer.userId;
            const client = new CognitoIdentityProviderClient();

            // Get user details from Cognito using the authenticated user's email
            const cognitoUserCommand = new AdminGetUserCommand({
              UserPoolId: USER_POOL,
              Username: cognito_id,
            });
            const cognitoUser = await client.send(cognitoUserCommand);

            // Extract user attributes
            const getAttr = (name) => {
              const attr = cognitoUser.UserAttributes?.find(a => a.Name === name);
              return attr ? attr.Value : null;
            };

            const given_name = getAttr('given_name') || 'Student';
            const family_name = getAttr('family_name') || 'User';
            const username = getAttr('preferred_username') || student_email.split('@')[0];

            // Create the user in the database
            const newUserResult = await sqlConnection`
              INSERT INTO "users" (user_email, username, first_name, last_name, time_account_created, roles, last_sign_in)
              VALUES (${student_email}, ${username}, ${given_name}, ${family_name}, CURRENT_TIMESTAMP, ARRAY['student'], CURRENT_TIMESTAMP)
              RETURNING user_id;
            `;

            user_id = newUserResult[0].user_id;
            console.log(`Created database user with ID: ${user_id}`);
          } catch (createErr) {
            console.error("Error creating user in database:", createErr);
            response.statusCode = 500;
            response.body = JSON.stringify({
              error: "Failed to create user record. Please try again or contact support.",
            });
            return response;
          }
        } else {
          user_id = userResult[0].user_id;
        }

        // Step 2: Retrieve the simulation_group_id using the access code
        const groupResult = await sqlConnection`
              SELECT simulation_group_id
              FROM "simulation_groups"
              WHERE group_access_code = ${group_access_code}
              AND group_student_access = TRUE
              LIMIT 1;
          `;

        if (groupResult.length === 0) {
          response.statusCode = 404;
          response.body = JSON.stringify({
            error: "Invalid group access code or group not available.",
          });
          return response;
        }

        const simulation_group_id = groupResult[0].simulation_group_id;

        // Step 3: Insert enrollment into enrolments table
        const enrollmentResult = await sqlConnection`
              INSERT INTO "enrolments" (enrolment_id, user_id, simulation_group_id, enrolment_type, time_enroled)
              VALUES (uuid_generate_v4(), ${user_id}, ${simulation_group_id}, 'student', CURRENT_TIMESTAMP)
              ON CONFLICT (simulation_group_id, user_id) DO NOTHING
              RETURNING enrolment_id;
          `;

        const enrolment_id = enrollmentResult[0]?.enrolment_id;

        if (enrolment_id) {
          // Step 4: Retrieve all patient IDs for the simulation group
          const patientsResult = await sqlConnection`
                SELECT patient_id
                FROM "patients"
                WHERE simulation_group_id = ${simulation_group_id};
            `;

          // Step 5: Insert a record into student_interactions for each patient
          const studentPatientInsertions = patientsResult.map((patient) => {
            return sqlConnection`
                  INSERT INTO "student_interactions" (student_interaction_id, patient_id, enrolment_id, patient_score, last_accessed, patient_context_embedding, is_completed)
                  VALUES (uuid_generate_v4(), ${patient.patient_id}, ${enrolment_id}, 0, CURRENT_TIMESTAMP, NULL, FALSE);
              `;
          });

          // Execute all insertions
          await Promise.all(studentPatientInsertions);
        }

        response.statusCode = 201; // Set status to 201 on successful enrollment
        response.body = JSON.stringify({
          message:
            "Student enrolled and patient records created successfully.",
        });
      } catch (err) {
        console.error("Error during student enrollment:", {
          message: err.message,
          stack: err.stack,
          student_email,
          group_access_code,
        });
        response.statusCode = 500;
        response.body = JSON.stringify({
          error: "Internal server error during enrollment. Please check logs for details."
        });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "student_email and group_access_code query parameters are required",
      });
    }
    return response;
  },
};

module.exports = routes;
