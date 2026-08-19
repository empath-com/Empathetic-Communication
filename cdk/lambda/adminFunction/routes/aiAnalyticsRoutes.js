/**
 * Admin AI analytics route handler.
 * Routes: POST ai_analytics_query
 *
 * Delegates the heavy lifting to analytics/aiAnalyticsHandler.js.
 */

const { handleAiAnalyticsQuery } = require("../analytics/aiAnalyticsHandler");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const lambdaClient = new LambdaClient({});

async function invokeInBatches(sessionIds) {
  const batchSize = 10;
  let dispatched = 0;

  for (let index = 0; index < sessionIds.length; index += batchSize) {
    const batch = sessionIds.slice(index, index + batchSize);
    const results = await Promise.allSettled(
      batch.map((sessionId) =>
        lambdaClient.send(
          new InvokeCommand({
            FunctionName: process.env.TEXT_GEN_FUNCTION_NAME,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({
              conversationAnalytics: true,
              session_id: sessionId,
            })),
          })
        )
      )
    );
    dispatched += results.filter((result) => result.status === "fulfilled").length;
  }

  return dispatched;
}

module.exports = {
  "POST /admin/ai_analytics_query": async ({ event, sqlConnection, response }) => {
    try {
      if (!event.body) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: "Request body is required" });
        return;
      }

      const requestBody = JSON.parse(event.body);
      const question = (requestBody.question || "").trim();
      if (!question) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: "question is required" });
        return;
      }

      const analyticsResult = await handleAiAnalyticsQuery(sqlConnection, question);
      response.body = JSON.stringify({ question, ...analyticsResult });
    } catch (err) {
      response.statusCode = 500;
      console.error("[ai_analytics_query] Error:", err);
      response.body = JSON.stringify({ error: "Failed to process analytics question", details: err.message });
    }
  },

  "POST /admin/backfill_conversation_analytics": async ({ sqlConnection, response }) => {
    if (!process.env.TEXT_GEN_FUNCTION_NAME) {
      response.statusCode = 500;
      response.body = JSON.stringify({ error: "Conversation analytics worker is not configured" });
      return response;
    }

    try {
      await sqlConnection`
        WITH eligible_sessions AS (
          SELECT s.session_id
          FROM sessions s
          JOIN student_interactions si ON si.student_interaction_id = s.student_interaction_id
          LEFT JOIN conversation_analytics_snapshots snapshot ON snapshot.session_id = s.session_id
          WHERE snapshot.session_id IS NULL
            AND (
              s.completion_status = 'completed'
              OR si.is_completed = TRUE
              OR si.patient_score = 100
            )
        ), normalized_sessions AS (
          UPDATE sessions s
          SET completion_status = 'completed',
              completed_at = COALESCE(s.completed_at, s.last_accessed, s.started_at, CURRENT_TIMESTAMP)
          FROM eligible_sessions eligible
          WHERE s.session_id = eligible.session_id
          RETURNING s.session_id
        )
        INSERT INTO conversation_analytics_jobs (session_id, status, last_error, updated_at)
        SELECT session_id, 'pending', NULL, CURRENT_TIMESTAMP
        FROM normalized_sessions
        ON CONFLICT (session_id) DO UPDATE SET
          status = 'pending',
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE conversation_analytics_jobs.status IN ('failed', 'completed');
      `;

      const pendingJobs = await sqlConnection`
        SELECT job.session_id
        FROM conversation_analytics_jobs job
        JOIN sessions s ON s.session_id = job.session_id
        LEFT JOIN conversation_analytics_snapshots snapshot ON snapshot.session_id = job.session_id
        WHERE job.status = 'pending'
          AND s.completion_status = 'completed'
          AND snapshot.session_id IS NULL
        ORDER BY job.created_at, job.session_id;
      `;

      const dispatched = await invokeInBatches(
        pendingJobs.map((job) => job.session_id)
      );

      response.statusCode = 202;
      response.body = JSON.stringify({
        queued: pendingJobs.length,
        dispatched,
        message: "Conversation analytics backfill has been queued.",
      });
    } catch (err) {
      response.statusCode = 500;
      console.error("[backfill_conversation_analytics] Error:", err);
      response.body = JSON.stringify({ error: "Failed to queue conversation analytics backfill" });
    }
  },

  "GET /admin/conversation_analytics_backfill_status": async ({ sqlConnection, response }) => {
    try {
      const [counts, failures] = await Promise.all([
        sqlConnection`
          SELECT status, COUNT(*) AS count
          FROM conversation_analytics_jobs
          GROUP BY status
          ORDER BY status;
        `,
        sqlConnection`
          SELECT job.session_id, job.attempts, job.last_error, job.updated_at
          FROM conversation_analytics_jobs job
          WHERE job.status = 'failed'
          ORDER BY job.updated_at DESC
          LIMIT 5;
        `,
      ]);

      response.statusCode = 200;
      response.body = JSON.stringify({
        counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])),
        failures,
      });
    } catch (err) {
      response.statusCode = 500;
      console.error("[conversation_analytics_backfill_status] Error:", err);
      response.body = JSON.stringify({ error: "Failed to retrieve conversation analytics status" });
    }
  },
};
