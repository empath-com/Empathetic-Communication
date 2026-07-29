const { NotFoundError } = require("../shared/errors");

async function getUserIdByEmail(sqlConnection, email) {
  const rows = await sqlConnection`
    SELECT user_id
    FROM "users"
    WHERE user_email = ${email}
    LIMIT 1;
  `;

  const userId = rows[0]?.user_id;
  if (!userId) {
    throw new NotFoundError("User not found");
  }

  return userId;
}

async function upsertStudentUser(sqlConnection, payload) {
  const { user_email, username, first_name, last_name } = payload;

  const existingUser = await sqlConnection`
    SELECT * FROM "users"
    WHERE user_email = ${user_email};
  `;

  if (existingUser.length > 0) {
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
    return updatedUser[0];
  }

  const newUser = await sqlConnection`
    INSERT INTO "users" (
      user_email, username, first_name, last_name, time_account_created, roles, last_sign_in
    )
    VALUES (
      ${user_email}, ${username}, ${first_name}, ${last_name}, CURRENT_TIMESTAMP, ARRAY['student'], CURRENT_TIMESTAMP
    )
    RETURNING *;
  `;
  return newUser[0];
}

async function getUserRoles(sqlConnection, userEmail) {
  const userData = await sqlConnection`
    SELECT roles
    FROM "users"
    WHERE user_email = ${userEmail};
  `;

  if (!userData.length) {
    throw new NotFoundError("User not found");
  }

  return userData[0].roles;
}

async function getUserFirstName(sqlConnection, userEmail) {
  const userData = await sqlConnection`
    SELECT first_name
    FROM "users"
    WHERE user_email = ${userEmail};
  `;

  if (!userData.length) {
    throw new NotFoundError("User not found");
  }

  return userData[0].first_name;
}

module.exports = {
  getUserIdByEmail,
  upsertStudentUser,
  getUserRoles,
  getUserFirstName,
};
