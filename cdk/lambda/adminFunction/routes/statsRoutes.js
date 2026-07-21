/**
 * Admin stats/analytics route handlers.
 * Routes: GET active_students_count, GET completed_exercises_count,
 *         GET active_students_trend, GET completed_exercises_trend
 */

module.exports = {
  "GET /admin/active_students_count": async ({ event, sqlConnection, response }) => {
    try {
      console.log("[active_students_count] Request received");
      const qs = event.queryStringParameters || {};
      const days = qs.days ? parseInt(qs.days, 10) : null;
      const groupId = qs.simulation_group_id || null;
      console.log(`[active_students_count] Params - days: ${days}, groupId: ${groupId}`);

      if (groupId) {
        const result = await sqlConnection`
          SELECT COUNT(DISTINCT u.user_id)::int AS active_students
          FROM "users" u
          JOIN "enrolments" e ON e.user_id = u.user_id
          WHERE u.roles @> ARRAY['student']::varchar[]
            AND u.last_sign_in IS NOT NULL
            ${days ? sqlConnection`AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})` : sqlConnection``}
            AND e.simulation_group_id = ${groupId};
        `;
        response.body = JSON.stringify({ active_students: result[0].active_students });
      } else {
        const result = await sqlConnection`
          SELECT COUNT(*)::int AS active_students
          FROM "users" u
          WHERE u.roles @> ARRAY['student']::varchar[]
            AND u.last_sign_in IS NOT NULL
            ${days ? sqlConnection`AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})` : sqlConnection``};
        `;
        response.body = JSON.stringify({ active_students: result[0].active_students });
      }
      console.log("[active_students_count] Success");
    } catch (err) {
      response.statusCode = 500;
      console.error("[active_students_count] Error:", err);
      response.body = JSON.stringify({ error: "Internal server error", details: err.message });
    }
  },

  "GET /admin/completed_exercises_count": async ({ event, sqlConnection, response }) => {
    try {
      console.log("[completed_exercises_count] Request received");
      const qs = event.queryStringParameters || {};
      const days = qs.days ? parseInt(qs.days, 10) : null;
      const groupId = qs.simulation_group_id || null;
      console.log(`[completed_exercises_count] Params - days: ${days}, groupId: ${groupId}`);

      const result = await sqlConnection`
        SELECT COUNT(DISTINCT e.user_id)::int AS completed_students
        FROM "student_interactions" si
        JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
        WHERE si.is_completed = TRUE
          ${days ? sqlConnection`AND si.last_accessed IS NOT NULL AND si.last_accessed >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})` : sqlConnection``}
          ${groupId ? sqlConnection`AND e.simulation_group_id = ${groupId}` : sqlConnection``};
      `;

      response.body = JSON.stringify({ completed_students: result[0].completed_students });
      console.log("[completed_exercises_count] Success");
    } catch (err) {
      response.statusCode = 500;
      console.error("[completed_exercises_count] Error:", err);
      response.body = JSON.stringify({ error: "Internal server error", details: err.message });
    }
  },

  "GET /admin/active_students_trend": async ({ event, sqlConnection, response }) => {
    try {
      console.log("[active_students_trend] Request received");
      const qs = event.queryStringParameters || {};
      const days = parseInt(qs.days || "30", 10);
      const groupId = qs.simulation_group_id || null;
      console.log(`[active_students_trend] Params - days: ${days}, groupId: ${groupId}`);

      let trend;
      if (groupId) {
        trend = await sqlConnection`
          SELECT u.last_sign_in::date AS day, COUNT(DISTINCT u.user_id)::int AS count
          FROM "users" u
          JOIN "enrolments" e ON e.user_id = u.user_id
          WHERE u.roles @> ARRAY['student']::varchar[]
            AND u.last_sign_in IS NOT NULL
            AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})
            AND e.simulation_group_id = ${groupId}
          GROUP BY day
          ORDER BY day;
        `;
      } else {
        trend = await sqlConnection`
          SELECT u.last_sign_in::date AS day, COUNT(*)::int AS count
          FROM "users" u
          WHERE u.roles @> ARRAY['student']::varchar[]
            AND u.last_sign_in IS NOT NULL
            AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})
          GROUP BY day
          ORDER BY day;
        `;
      }

      response.body = JSON.stringify(trend);
      console.log("[active_students_trend] Success");
    } catch (err) {
      response.statusCode = 500;
      console.error("[active_students_trend] Error:", err);
      response.body = JSON.stringify({ error: "Internal server error", details: err.message });
    }
  },

  "GET /admin/completed_exercises_trend": async ({ event, sqlConnection, response }) => {
    try {
      console.log("[completed_exercises_trend] Request received");
      const qs = event.queryStringParameters || {};
      const days = parseInt(qs.days || "30", 10);
      const groupId = qs.simulation_group_id || null;
      console.log(`[completed_exercises_trend] Params - days: ${days}, groupId: ${groupId}`);

      const trend = await sqlConnection`
        SELECT si.last_accessed::date AS day, COUNT(DISTINCT e.user_id)::int AS count
        FROM "student_interactions" si
        JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
        WHERE si.is_completed = TRUE
          AND si.last_accessed IS NOT NULL
          AND si.last_accessed >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})
          ${groupId ? sqlConnection`AND e.simulation_group_id = ${groupId}` : sqlConnection``}
        GROUP BY day
        ORDER BY day;
      `;
      response.body = JSON.stringify(trend);
      console.log("[completed_exercises_trend] Success");
    } catch (err) {
      response.statusCode = 500;
      console.error("[completed_exercises_trend] Error:", err);
      response.body = JSON.stringify({ error: "Internal server error", details: err.message });
    }
  },
};
