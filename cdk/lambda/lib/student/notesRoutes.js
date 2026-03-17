const routes = {
  "GET /student/get_notes": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.session_id
    ) {
      const sessionId = event.queryStringParameters.session_id;

      try {
        // Query to get the notes for the session
        const notesData = await sqlConnection`
                SELECT notes
                FROM "sessions"
                WHERE session_id = ${sessionId};
            `;

        if (notesData.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify({ notes: notesData[0].notes });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Notes not found." });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "session_id is required." });
    }
    return response;
  },

  "PUT /student/update_notes": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters &&
      event.queryStringParameters.session_id &&
      event.body
    ) {
      const sessionId = event.queryStringParameters.session_id;
      const { notes } = JSON.parse(event.body);

      try {
        // Update the notes for the session
        const updateResult = await sqlConnection`
                UPDATE "sessions"
                SET notes = ${notes}, last_accessed = CURRENT_TIMESTAMP
                WHERE session_id = ${sessionId}
                RETURNING *;
            `;

        if (updateResult.length > 0) {
          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "Notes updated successfully.",
            session: updateResult[0],
          });
        } else {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Session not found." });
        }
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "Invalid input." });
    }
    return response;
  },
};

module.exports = routes;
