/**
 * Admin AI analytics route handler.
 * Routes: POST ai_analytics_query
 *
 * Delegates the heavy lifting to analytics/aiAnalyticsHandler.js.
 */

const { handleAiAnalyticsQuery } = require("../analytics/aiAnalyticsHandler");

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
};
