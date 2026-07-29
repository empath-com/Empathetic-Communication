const { upsertStudentUser, getUserRoles, getUserFirstName } = require("../services/usersService");

const routes = {
  "POST /student/create_user": async ({ event, sqlConnection, response }) => {
    const user = await upsertStudentUser(sqlConnection, event.queryStringParameters || {});
    response.statusCode = 200;
    response.body = JSON.stringify(user);
    return response;
  },

  "GET /student/get_user_roles": async ({ event, sqlConnection, response }) => {
    const userEmail = event.queryStringParameters.user_email;
    const roles = await getUserRoles(sqlConnection, userEmail);
    response.statusCode = 200;
    response.body = JSON.stringify({ roles });
    return response;
  },

  "GET /student/get_name": async ({ event, sqlConnection, response }) => {
    const userEmail = event.queryStringParameters.user_email;
    const firstName = await getUserFirstName(sqlConnection, userEmail);
    response.statusCode = 200;
    response.body = JSON.stringify({ name: firstName });
    return response;
  },
};

module.exports = routes;
