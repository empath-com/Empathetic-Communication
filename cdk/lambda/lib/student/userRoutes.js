const routes = {
  "POST /student/create_user": async ({ event, sqlConnection, response }) => {
    if (event.queryStringParameters) {
      const {
        user_email,
        username,
        first_name,
        last_name,
        preferred_name,
      } = event.queryStringParameters;

      try {
        // Check if the user already exists
        const existingUser = await sqlConnection`
            SELECT * FROM "users"
            WHERE user_email = ${user_email};
        `;

        if (existingUser.length > 0) {
          // Update the existing user's information
          const updatedUser = await sqlConnection`
                UPDATE "users"
                SET
                    username = ${username},
                    first_name = ${first_name},
                    last_name = ${last_name},
                    last_sign_in = CURRENT_TIMESTAMP,
                    time_account_created = CURRENT_TIMESTAMP
                WHERE user_email = ${user_email}
                RETURNING *;
            `;
          response.body = JSON.stringify(updatedUser[0]);
        } else {
          // Insert a new user with 'student' role
          const newUser = await sqlConnection`
                INSERT INTO "users" (user_email, username, first_name, last_name, time_account_created, roles, last_sign_in)
                VALUES (${user_email}, ${username}, ${first_name}, ${last_name}, CURRENT_TIMESTAMP, ARRAY['student'], CURRENT_TIMESTAMP)
                RETURNING *;
            `;
          response.body = JSON.stringify(newUser[0]);
        }
      } catch (err) {
        response.statusCode = 500;
        console.log(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "User data is required" });
    }
    return response;
  },

  "GET /student/get_user_roles": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.user_email
    ) {
      const user_email = event.queryStringParameters.user_email;
      try {
        // Retrieve roles for the user with the provided email
        const userData = await sqlConnection`
            SELECT roles
            FROM "users"
            WHERE user_email = ${user_email};
          `;
        if (userData.length > 0) {
          response.body = JSON.stringify({ roles: userData[0].roles });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "User not found" });
        }
      } catch (err) {
        response.statusCode = 500;
        console.log(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "User email is required" });
    }
    return response;
  },

  "GET /student/get_name": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.user_email
    ) {
      const user_email = event.queryStringParameters.user_email;
      try {
        // Retrieve roles for the user with the provided email
        const userData = await sqlConnection`
              SELECT first_name
              FROM "users"
              WHERE user_email = ${user_email};
            `;
        if (userData.length > 0) {
          response.body = JSON.stringify({ name: userData[0].first_name });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "User not found" });
        }
      } catch (err) {
        response.statusCode = 500;
        console.log(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "User email is required" });
    }
    return response;
  },
};

module.exports = routes;
