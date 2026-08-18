const { UnauthorizedError } = require("../shared/errors");

function toNumber(value) {
  return Number(value || 0);
}

function normalizeRows(rows, numericFields = []) {
  return rows.map((row) => {
    const normalized = { ...row };
    numericFields.forEach((field) => {
      normalized[field] = toNumber(row[field]);
    });
    return normalized;
  });
}

async function getOwnedGroups(sqlConnection, instructorEmail) {
  return sqlConnection`
    SELECT sg.simulation_group_id, sg.group_name
    FROM enrolments e
    JOIN users u ON e.user_id = u.user_id
    JOIN simulation_groups sg ON e.simulation_group_id = sg.simulation_group_id
    WHERE u.user_email = ${instructorEmail}
      AND e.enrolment_type = 'instructor'
    ORDER BY sg.group_name, sg.simulation_group_id;
  `;
}

const routes = {
  "GET /instructor/analytics": async ({ event, sqlConnection, response, userEmailAttribute }) => {
    const query = event.queryStringParameters || {};
    const simulationGroupId = query.simulation_group_id || null;
    const patientId = query.patient_id || null;
    const studentUserId = query.student_user_id || null;

    const groups = await getOwnedGroups(sqlConnection, userEmailAttribute);
    if (simulationGroupId && !groups.some((group) => group.simulation_group_id === simulationGroupId)) {
      throw new UnauthorizedError("Unauthorized simulation group");
    }

    const [patients, students] = await Promise.all([
      sqlConnection`
        SELECT p.patient_id, p.patient_name, p.simulation_group_id
        FROM patients p
        WHERE p.simulation_group_id IN (
          SELECT e.simulation_group_id
          FROM enrolments e
          JOIN users u ON e.user_id = u.user_id
          WHERE u.user_email = ${userEmailAttribute}
            AND e.enrolment_type = 'instructor'
        )
        AND (${simulationGroupId}::uuid IS NULL OR p.simulation_group_id = ${simulationGroupId})
        ORDER BY p.patient_name, p.patient_id;
      `,
      sqlConnection`
        SELECT DISTINCT u.user_id AS student_user_id,
          COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.user_email) AS student_name
        FROM users u
        JOIN enrolments e ON u.user_id = e.user_id
        WHERE 'student' = ANY(u.roles)
          AND e.simulation_group_id IN (
            SELECT ie.simulation_group_id
            FROM enrolments ie
            JOIN users iu ON ie.user_id = iu.user_id
            WHERE iu.user_email = ${userEmailAttribute}
              AND ie.enrolment_type = 'instructor'
          )
          AND (${simulationGroupId}::uuid IS NULL OR e.simulation_group_id = ${simulationGroupId})
          AND (${patientId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM student_interactions si
            WHERE si.enrolment_id = e.enrolment_id AND si.patient_id = ${patientId}
          ))
        ORDER BY student_name, student_user_id;
      `,
    ]);

    const scope = [userEmailAttribute, simulationGroupId, patientId, studentUserId];
    const [coverageRows, recommendations, communicationMetrics, engagementDistribution, completionByCase, studentEngagement, unfinishedAttempts] = await Promise.all([
      sqlConnection`
        WITH attempts AS (
          SELECT s.session_id, s.completion_status
          FROM sessions s
          JOIN student_interactions si ON s.student_interaction_id = si.student_interaction_id
          JOIN enrolments e ON si.enrolment_id = e.enrolment_id
          JOIN users u ON e.user_id = u.user_id
          WHERE 'student' = ANY(u.roles)
            AND e.simulation_group_id IN (
              SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
              WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
            )
            AND (${scope[1]}::uuid IS NULL OR e.simulation_group_id = ${scope[1]})
            AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
            AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
        )
        SELECT COUNT(*) AS total_attempts,
          COUNT(*) FILTER (WHERE completion_status = 'completed') AS completed_attempts,
          COUNT(*) FILTER (WHERE completion_status = 'in_progress') AS in_progress_attempts,
          COUNT(cas.session_id) AS analyzed_attempts,
          COUNT(caj.session_id) FILTER (WHERE caj.status = 'pending') AS pending_analytics
        FROM attempts a
        LEFT JOIN conversation_analytics_snapshots cas ON a.session_id = cas.session_id
        LEFT JOIN conversation_analytics_jobs caj ON a.session_id = caj.session_id;
      `,
      sqlConnection`
        SELECT crt.topic_key, COUNT(*) AS count
        FROM conversation_recommendation_topics crt
        JOIN sessions s ON crt.session_id = s.session_id
        JOIN student_interactions si ON s.student_interaction_id = si.student_interaction_id
        JOIN enrolments e ON si.enrolment_id = e.enrolment_id
        JOIN users u ON e.user_id = u.user_id
        WHERE 'student' = ANY(u.roles)
          AND e.simulation_group_id IN (
            SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
            WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
          )
          AND (${scope[1]}::uuid IS NULL OR e.simulation_group_id = ${scope[1]})
          AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
          AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
        GROUP BY crt.topic_key
        ORDER BY count DESC, crt.topic_key;
      `,
      sqlConnection`
        SELECT cmc.metric_key, SUM(cmc.metric_count) AS count
        FROM conversation_metric_counts cmc
        JOIN sessions s ON cmc.session_id = s.session_id
        JOIN student_interactions si ON s.student_interaction_id = si.student_interaction_id
        JOIN enrolments e ON si.enrolment_id = e.enrolment_id
        JOIN users u ON e.user_id = u.user_id
        WHERE 'student' = ANY(u.roles)
          AND e.simulation_group_id IN (
            SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
            WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
          )
          AND (${scope[1]}::uuid IS NULL OR e.simulation_group_id = ${scope[1]})
          AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
          AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
        GROUP BY cmc.metric_key
        ORDER BY count DESC, cmc.metric_key;
      `,
      sqlConnection`
        SELECT s.session_id,
          ROW_NUMBER() OVER (
            PARTITION BY si.student_interaction_id
            ORDER BY s.started_at ASC NULLS LAST, s.session_id
          ) AS attempt_number,
          s.active_duration_seconds,
          COALESCE(cas.message_span_seconds, 0) AS message_span_seconds,
          COALESCE(cas.dialogue_turn_count, 0) AS dialogue_turn_count,
          cas.communication_score,
          cas.objective_achieved,
          s.completion_status
        FROM sessions s
        JOIN student_interactions si ON s.student_interaction_id = si.student_interaction_id
        JOIN enrolments e ON si.enrolment_id = e.enrolment_id
        JOIN users u ON e.user_id = u.user_id
        LEFT JOIN conversation_analytics_snapshots cas ON s.session_id = cas.session_id
        WHERE 'student' = ANY(u.roles)
          AND e.simulation_group_id IN (
            SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
            WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
          )
          AND (${scope[1]}::uuid IS NULL OR e.simulation_group_id = ${scope[1]})
          AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
          AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
        ORDER BY s.started_at ASC NULLS LAST, s.session_id;
      `,
      sqlConnection`
        SELECT p.patient_id, p.patient_name,
          COUNT(s.session_id) AS total_attempts,
          COUNT(s.session_id) FILTER (WHERE s.completion_status = 'completed') AS completed_attempts,
          ROUND(AVG(cas.communication_score), 1) AS average_communication_score,
          ROUND(100.0 * COUNT(s.session_id) FILTER (WHERE s.completion_status = 'completed') / NULLIF(COUNT(s.session_id), 0), 1) AS completion_rate,
          ROUND(100.0 * AVG(CASE WHEN cas.objective_achieved THEN 1 ELSE 0 END), 1) AS objective_achievement_rate
        FROM patients p
        LEFT JOIN student_interactions si ON p.patient_id = si.patient_id
        LEFT JOIN enrolments e ON si.enrolment_id = e.enrolment_id
        LEFT JOIN users u ON e.user_id = u.user_id
        LEFT JOIN sessions s ON s.student_interaction_id = si.student_interaction_id
        LEFT JOIN conversation_analytics_snapshots cas ON s.session_id = cas.session_id
        WHERE p.simulation_group_id IN (
          SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
          WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
        )
          AND (${scope[1]}::uuid IS NULL OR p.simulation_group_id = ${scope[1]})
          AND (${scope[2]}::uuid IS NULL OR p.patient_id = ${scope[2]})
          AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
          AND (u.user_id IS NULL OR 'student' = ANY(u.roles))
        GROUP BY p.patient_id, p.patient_name
        ORDER BY p.patient_name, p.patient_id;
      `,
      sqlConnection`
        SELECT u.user_id AS student_user_id,
          COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.user_email) AS student_name,
          (
            SELECT COUNT(*) FROM user_engagement_log uel
            WHERE uel.user_id = u.user_id
              AND uel.simulation_group_id = e.simulation_group_id
              AND uel.engagement_type = 'login'
          ) AS login_count,
          (
            SELECT COUNT(DISTINCT si.patient_id)
            FROM student_interactions si
            JOIN sessions s ON s.student_interaction_id = si.student_interaction_id
            WHERE si.enrolment_id = e.enrolment_id
              AND s.completion_status = 'completed'
              AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
          ) AS cases_completed,
          (
            SELECT COALESCE(SUM(s.active_duration_seconds), 0)
            FROM student_interactions si
            JOIN sessions s ON s.student_interaction_id = si.student_interaction_id
            WHERE si.enrolment_id = e.enrolment_id
              AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
          ) AS active_duration_seconds
        FROM users u
        JOIN enrolments e ON u.user_id = e.user_id
        WHERE 'student' = ANY(u.roles)
          AND e.simulation_group_id IN (
            SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
            WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
          )
          AND (${scope[1]}::uuid IS NULL OR e.simulation_group_id = ${scope[1]})
          AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
          AND (${scope[2]}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM student_interactions psi WHERE psi.enrolment_id = e.enrolment_id AND psi.patient_id = ${scope[2]}
          ))
        GROUP BY u.user_id, u.first_name, u.last_name, u.user_email
        ORDER BY student_name, student_user_id;
      `,
      sqlConnection`
        SELECT CASE
          WHEN message_count = 0 THEN 'No dialogue'
          WHEN message_count <= 2 THEN '1-2 turns'
          WHEN message_count <= 5 THEN '3-5 turns'
          ELSE '6+ turns'
        END AS stage,
        COUNT(*) AS count
        FROM (
          SELECT s.session_id, COUNT(m.message_id) FILTER (WHERE m.student_sent) AS message_count
          FROM sessions s
          JOIN student_interactions si ON s.student_interaction_id = si.student_interaction_id
          JOIN enrolments e ON si.enrolment_id = e.enrolment_id
          JOIN users u ON e.user_id = u.user_id
          LEFT JOIN messages m ON s.session_id = m.session_id
          WHERE s.completion_status = 'in_progress'
            AND 'student' = ANY(u.roles)
            AND e.simulation_group_id IN (
              SELECT ie.simulation_group_id FROM enrolments ie JOIN users iu ON ie.user_id = iu.user_id
              WHERE iu.user_email = ${scope[0]} AND ie.enrolment_type = 'instructor'
            )
            AND (${scope[1]}::uuid IS NULL OR e.simulation_group_id = ${scope[1]})
            AND (${scope[2]}::uuid IS NULL OR si.patient_id = ${scope[2]})
            AND (${scope[3]}::uuid IS NULL OR u.user_id = ${scope[3]})
          GROUP BY s.session_id
        ) unfinished
        GROUP BY stage
        ORDER BY stage;
      `,
    ]);

    const coverage = normalizeRows(coverageRows, [
      "total_attempts",
      "completed_attempts",
      "in_progress_attempts",
      "analyzed_attempts",
      "pending_analytics",
    ])[0] || {};

    response.statusCode = 200;
    response.body = JSON.stringify({
      filters: { groups, patients, students },
      coverage,
      recommendations: normalizeRows(recommendations, ["count"]),
      communication_metrics: normalizeRows(communicationMetrics, ["count"]),
      engagement_distribution: normalizeRows(engagementDistribution, [
        "attempt_number",
        "active_duration_seconds",
        "message_span_seconds",
        "dialogue_turn_count",
      ]).map((row) => ({
        ...row,
        communication_score:
          row.communication_score === null ? null : toNumber(row.communication_score),
      })),
      completion_by_case: normalizeRows(completionByCase, [
        "total_attempts",
        "completed_attempts",
        "average_communication_score",
        "completion_rate",
        "objective_achievement_rate",
      ]),
      student_engagement: normalizeRows(studentEngagement, [
        "login_count",
        "cases_completed",
        "active_duration_seconds",
      ]),
      unfinished_attempts: normalizeRows(unfinishedAttempts, ["count"]),
    });
    return response;
  },
};

module.exports = routes;