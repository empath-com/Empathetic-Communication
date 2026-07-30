/**
 * Admin system/empathy prompt management route handlers.
 * Routes: GET system_prompts, POST update_system_prompt, POST restore_system_prompt,
 *         GET empathy_prompts, POST update_empathy_prompt, POST restore_empathy_prompt
 */

const VALID_EMPATHY_TOOLS = ["CARE", "CARE_RELAXED", "PRISM", "PRISM_RELAXED", "NURSE", "NURSE_RELAXED"];

module.exports = {
  "GET /admin/system_prompts": async ({ sqlConnection, response }) => {
    try {
      const latestPrompt = await sqlConnection`
        SELECT prompt_content, created_at
        FROM "system_prompt_history"
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const promptHistory = await sqlConnection`
        SELECT history_id, prompt_content, created_at
        FROM "system_prompt_history"
        ORDER BY created_at DESC
        OFFSET 1;
      `;
      response.body = JSON.stringify({
        current_prompt: latestPrompt[0]?.prompt_content || "",
        history: promptHistory,
      });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/update_system_prompt": async ({ event, sqlConnection, response }) => {
    if (!event.body) {
      response.statusCode = 400;
      response.body = "prompt_content is required";
      return;
    }
    try {
      const { prompt_content } = JSON.parse(event.body);
      if (!prompt_content || !prompt_content.trim()) {
        response.statusCode = 400;
        response.body = "prompt_content is required";
        return;
      }
      await sqlConnection`
        INSERT INTO "system_prompt_history" (prompt_content) VALUES (${prompt_content});
      `;
      response.body = JSON.stringify({ message: "System prompt updated successfully" });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/restore_system_prompt": async ({ event, sqlConnection, response }) => {
    try {
      const historyId = event.queryStringParameters?.history_id || null;

      if (historyId) {
        const rows = await sqlConnection`
          SELECT prompt_content FROM "system_prompt_history" WHERE history_id = ${historyId} LIMIT 1;
        `;
        const fromHistory = rows[0]?.prompt_content;
        if (!fromHistory) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "History entry not found" });
          return;
        }
        await sqlConnection`
          INSERT INTO "system_prompt_history" (prompt_content) VALUES (${fromHistory});
        `;
        response.body = JSON.stringify({ message: "System prompt restored successfully" });
        return;
      }

      if (event.body) {
        const { prompt_content } = JSON.parse(event.body);
        if (!prompt_content || !prompt_content.trim()) {
          response.statusCode = 400;
          response.body = "prompt_content is required";
          return;
        }
        await sqlConnection`
          INSERT INTO "system_prompt_history" (prompt_content) VALUES (${prompt_content});
        `;
        response.body = JSON.stringify({ message: "System prompt restored successfully" });
      } else {
        response.statusCode = 400;
        response.body = "history_id or prompt_content is required";
      }
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "GET /admin/empathy_prompts": async ({ sqlConnection, response }) => {
    try {
      const latestPrompt = await sqlConnection`
        SELECT prompt_content, empathy_tool, created_at
        FROM "empathy_prompt_history"
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const promptHistory = await sqlConnection`
        SELECT history_id, prompt_content, empathy_tool, created_at
        FROM "empathy_prompt_history"
        ORDER BY created_at DESC
        OFFSET 1;
      `;
      response.body = JSON.stringify({
        current_prompt: latestPrompt[0]?.prompt_content || "",
        current_empathy_tool: latestPrompt[0]?.empathy_tool || "CARE",
        history: promptHistory,
      });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/update_empathy_prompt": async ({ event, sqlConnection, response }) => {
    if (!event.body) {
      response.statusCode = 400;
      response.body = "prompt_content is required";
      return;
    }
    try {
      const { prompt_content, empathy_tool: bodyTool } = JSON.parse(event.body);
      if (!prompt_content || !prompt_content.trim()) {
        response.statusCode = 400;
        response.body = "prompt_content is required";
        return;
      }
      const resolvedTool = VALID_EMPATHY_TOOLS.includes(bodyTool) ? bodyTool : "CARE";
      await sqlConnection`
        INSERT INTO "empathy_prompt_history" (prompt_content, empathy_tool) VALUES (${prompt_content}, ${resolvedTool});
      `;
      response.body = JSON.stringify({ message: "Empathy prompt updated successfully" });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/restore_empathy_prompt": async ({ event, sqlConnection, response }) => {
    try {
      const historyId = event.queryStringParameters?.history_id || null;

      if (historyId) {
        const rows = await sqlConnection`
          SELECT prompt_content, empathy_tool FROM "empathy_prompt_history" WHERE history_id = ${historyId} LIMIT 1;
        `;
        const fromHistory = rows[0]?.prompt_content;
        if (!fromHistory) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "History entry not found" });
          return;
        }
        const restoredTool = VALID_EMPATHY_TOOLS.includes(rows[0]?.empathy_tool) ? rows[0].empathy_tool : "CARE";
        await sqlConnection`
          INSERT INTO "empathy_prompt_history" (prompt_content, empathy_tool) VALUES (${fromHistory}, ${restoredTool});
        `;
        response.body = JSON.stringify({ message: "Empathy prompt restored successfully" });
        return;
      }

      if (event.body) {
        const { prompt_content } = JSON.parse(event.body);
        if (!prompt_content || !prompt_content.trim()) {
          response.statusCode = 400;
          response.body = "prompt_content is required";
          return;
        }
        await sqlConnection`
          INSERT INTO "empathy_prompt_history" (prompt_content) VALUES (${prompt_content});
        `;
        response.body = JSON.stringify({ message: "Empathy prompt restored successfully" });
      } else {
        response.statusCode = 400;
        response.body = "history_id or prompt_content is required";
      }
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },
};
