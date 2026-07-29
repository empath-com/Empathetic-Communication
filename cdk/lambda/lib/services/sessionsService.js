const { NotFoundError } = require("../shared/errors");
const { getUserIdByEmail } = require("./usersService");
const { getEnrolmentId } = require("./groupsService");

async function createSession(sqlConnection, payload) {
  const { patientId, studentEmail, simulationGroupId, sessionName } = payload;
  const userId = await getUserIdByEmail(sqlConnection, studentEmail);

  const studentPatientData = await sqlConnection`
    SELECT student_interaction_id
    FROM "student_interactions"
    WHERE patient_id = ${patientId}
      AND enrolment_id = (
        SELECT enrolment_id
        FROM "enrolments"
        WHERE user_id = ${userId} AND simulation_group_id = ${simulationGroupId}
      );
  `;

  const studentPatientId = studentPatientData[0]?.student_interaction_id;
  if (!studentPatientId) {
    throw new NotFoundError("Student patient not found.");
  }

  await sqlConnection`
    UPDATE "student_interactions"
    SET last_accessed = CURRENT_TIMESTAMP
    WHERE student_interaction_id = ${studentPatientId};
  `;

  const sessionData = await sqlConnection`
    INSERT INTO "sessions" (session_id, student_interaction_id, session_name, session_context_embeddings, last_accessed, notes)
    VALUES (
      uuid_generate_v4(),
      ${studentPatientId},
      ${sessionName},
      ARRAY[]::float[],
      CURRENT_TIMESTAMP,
      NULL
    )
    RETURNING *;
  `;

  const enrolmentId = await getEnrolmentId(sqlConnection, userId, simulationGroupId);
  if (enrolmentId) {
    await sqlConnection`
      INSERT INTO "user_engagement_log" (
        log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
      ) VALUES (
        uuid_generate_v4(),
        ${userId},
        ${simulationGroupId},
        ${patientId},
        ${enrolmentId},
        CURRENT_TIMESTAMP,
        'session creation'
      );
    `;
  }

  return sessionData;
}

async function deleteSession(sqlConnection, payload) {
  const { sessionId, studentEmail, simulationGroupId, patientId } = payload;
  const userId = await getUserIdByEmail(sqlConnection, studentEmail);

  await sqlConnection`
    UPDATE "student_interactions"
    SET last_accessed = CURRENT_TIMESTAMP
    WHERE student_interaction_id = (
      SELECT student_interaction_id
      FROM "sessions"
      WHERE session_id = ${sessionId}
    );
  `;

  const deleteResult = await sqlConnection`
    DELETE FROM "sessions"
    WHERE session_id = ${sessionId}
    RETURNING *;
  `;

  if (!deleteResult.length) {
    throw new NotFoundError("Session not found.");
  }

  const enrolmentId = await getEnrolmentId(sqlConnection, userId, simulationGroupId);
  if (!enrolmentId) {
    throw new NotFoundError("Enrolment not found.");
  }

  await sqlConnection`
    INSERT INTO "user_engagement_log" (
      log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type
    ) VALUES (
      uuid_generate_v4(),
      ${userId},
      ${simulationGroupId},
      ${patientId},
      ${enrolmentId},
      CURRENT_TIMESTAMP,
      'session deletion'
    );
  `;

  return { success: "Session deleted" };
}

async function getMessagesForSession(sqlConnection, sessionId) {
  const data = await sqlConnection`
    SELECT *
    FROM "messages"
    WHERE session_id = ${sessionId}
    ORDER BY time_sent ASC;
  `;

  if (!data.length) {
    throw new NotFoundError("No messages found for this session.");
  }

  return data;
}

async function getMessagesForSessionLegacy(sqlConnection, sessionId) {
  return sqlConnection`
    SELECT *
    FROM "Messages"
    WHERE "session_id" = ${sessionId}
    ORDER BY "time_sent" ASC;
  `;
}

async function updateSessionName(sqlConnection, sessionId, sessionName) {
  const normalizedSessionName =
    typeof sessionName === "string" ? sessionName.trim() : sessionName;

  if (
    normalizedSessionName === undefined ||
    normalizedSessionName === null ||
    normalizedSessionName === ""
  ) {
    return { message: "No session_name provided; session not updated" };
  }

  const updateResult = await sqlConnection`
    UPDATE "sessions"
    SET session_name = ${normalizedSessionName}
    WHERE session_id = ${sessionId}
    RETURNING *;
  `;

  if (!updateResult.length) {
    throw new NotFoundError("Session not found");
  }

  return updateResult[0];
}

module.exports = {
  createSession,
  deleteSession,
  getMessagesForSession,
  getMessagesForSessionLegacy,
  updateSessionName,
};
