/**
 * Admin instructor/user management route handlers.
 * Routes: GET instructors, POST elevate_instructor, POST lower_instructor
 */

module.exports = {
  "GET /admin/instructors": async ({ event, sqlConnection, response }) => {
    if (event.queryStringParameters?.instructor_email) {
      const instructors = await sqlConnection`
        SELECT user_email, first_name, last_name
        FROM "users"
        WHERE roles @> ARRAY['instructor']::varchar[]
        ORDER BY last_name ASC;
      `;
      response.body = JSON.stringify(instructors);
    } else {
      response.statusCode = 400;
      response.body = "instructor_email is required";
    }
  },

  "POST /admin/elevate_instructor": async ({ event, sqlConnection, response }) => {
    if (!event.queryStringParameters?.email) {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "Email is required" });
      return;
    }
    const instructorEmail = event.queryStringParameters.email;

    try {
      const existingUser = await sqlConnection`
        SELECT * FROM "users" WHERE user_email = ${instructorEmail};
      `;

      if (existingUser.length > 0) {
        const userRoles = existingUser[0].roles;

        if (userRoles.includes("instructor") || userRoles.includes("admin")) {
          response.statusCode = 200;
          response.body = JSON.stringify({ message: "No changes made. User is already an instructor or admin." });
          return;
        }

        if (userRoles.includes("student")) {
          const newRoles = userRoles.map((role) => (role === "student" ? "instructor" : role));
          await sqlConnection`
            UPDATE "users" SET roles = ${newRoles} WHERE user_email = ${instructorEmail};
          `;
          response.statusCode = 200;
          response.body = JSON.stringify({ message: "User role updated to instructor." });
          return;
        }
      } else {
        await sqlConnection`
          INSERT INTO "users" (user_email, roles) VALUES (${instructorEmail}, ARRAY['instructor']);
        `;
        response.statusCode = 201;
        response.body = JSON.stringify({ message: "New user created and elevated to instructor." });
      }
    } catch (err) {
      response.statusCode = 500;
      console.error(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/lower_instructor": async ({ event, sqlConnection, response }) => {
    if (!event.queryStringParameters?.email) {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "email query parameter is missing" });
      return;
    }
    try {
      const userEmail = event.queryStringParameters.email;

      const userRoleData = await sqlConnection`
        SELECT roles, user_id FROM "users" WHERE user_email = ${userEmail};
      `;
      const userRoles = userRoleData[0]?.roles;
      const userId = userRoleData[0]?.user_id;

      if (!userRoles || !userRoles.includes("instructor")) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: "User is not an instructor or doesn't exist" });
        return;
      }

      const updatedRoles = userRoles.filter((role) => role !== "instructor").concat("student");
      await sqlConnection`
        UPDATE "users" SET roles = ${updatedRoles} WHERE user_email = ${userEmail};
      `;
      await sqlConnection`
        DELETE FROM "enrolments" WHERE user_id = ${userId} AND enrolment_type = 'instructor';
      `;

      response.statusCode = 200;
      response.body = JSON.stringify({ message: `User role updated to student for ${userEmail} and all instructor enrolments deleted.` });
    } catch (err) {
      console.log(err);
      response.statusCode = 500;
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },
};
