const { BadRequestError } = require("../shared/errors");
const {
  createSession,
  deleteSession,
  getMessagesForSession,
  getMessagesForSessionLegacy,
  updateSessionName,
} = require("../services/sessionsService");

const routes = {
  "POST /student/create_session": async ({ event, sqlConnection, response }) => {
    const sessionData = await createSession(sqlConnection, {
      patientId: event.queryStringParameters.patient_id,
      studentEmail: event.queryStringParameters.email,
      simulationGroupId: event.queryStringParameters.simulation_group_id,
      sessionName: event.queryStringParameters.session_name,
    });
    response.statusCode = 200;
    response.body = JSON.stringify(sessionData);
    return response;
  },

  "DELETE /student/delete_session": async ({ event, sqlConnection, response }) => {
    const result = await deleteSession(sqlConnection, {
      sessionId: event.queryStringParameters.session_id,
      studentEmail: event.queryStringParameters.email,
      simulationGroupId: event.queryStringParameters.simulation_group_id,
      patientId: event.queryStringParameters.patient_id,
    });
    response.statusCode = 200;
    response.body = JSON.stringify(result);
    return response;
  },

  "GET /student/get_messages": async ({ event, sqlConnection, response }) => {
    const sessionId = event.queryStringParameters.session_id;
    const data = await getMessagesForSession(sqlConnection, sessionId);
    response.statusCode = 200;
    response.body = JSON.stringify(data);
    return response;
  },

  "GET /session/messages": async ({ event, sqlConnection, response }) => {
    const sessionId = event.queryStringParameters.session_id;
    const messages = await getMessagesForSessionLegacy(sqlConnection, sessionId);
    response.statusCode = 200;
    response.body = JSON.stringify(messages);
    return response;
  },

  "PUT /student/update_session_name": async ({ event, sqlConnection, response }) => {
    if (!event.body) {
      throw new BadRequestError("Request body is required");
    }

    const { session_name } = JSON.parse(event.body);
    const result = await updateSessionName(
      sqlConnection,
      event.queryStringParameters.session_id,
      session_name
    );
    response.statusCode = 200;
    response.body = JSON.stringify(result);
    return response;
  },
};

module.exports = routes;
