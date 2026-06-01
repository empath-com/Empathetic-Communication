const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const ADMIN_ANALYTICS_MODEL_ID =
  process.env.ADMIN_ANALYTICS_MODEL_ID || "meta.llama3-70b-instruct-v1:0";
const MAX_ANALYTICS_ROWS = 200;

const bedrockRuntime = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
});

const sanitizeMermaidText = (value) => {
  if (value === null || value === undefined) {
    return "(null)";
  }
  return String(value).replace(/"/g, "'").replace(/\n/g, " ").trim();
};

const extractJson = (text) => {
  if (!text) {
    return null;
  }

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_e) {
    return null;
  }
};

const validateAndNormalizeSql = (sqlText) => {
  if (!sqlText || typeof sqlText !== "string") {
    throw new Error("Missing SQL from AI model");
  }

  let sql = sqlText.trim().replace(/;+\s*$/g, "");
  const lowered = sql.toLowerCase();

  if (!(lowered.startsWith("select") || lowered.startsWith("with"))) {
    throw new Error("Only SELECT queries are allowed");
  }

  if (/;/.test(sql)) {
    throw new Error("Multiple statements are not allowed");
  }

  if (
    /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|call|copy|merge|vacuum|analyze)\b/i.test(
      sql
    )
  ) {
    throw new Error("Query contains forbidden SQL keywords");
  }

  if (!/\blimit\s+\d+/i.test(sql)) {
    sql = `${sql} LIMIT ${MAX_ANALYTICS_ROWS}`;
  }

  return sql;
};

const pickChartColumns = (rows, suggestedX, suggestedY) => {
  if (!rows.length) {
    return { xColumn: null, yColumn: null };
  }

  const columns = Object.keys(rows[0]);
  const isNumericColumn = (colName) => {
    const values = rows
      .map((r) => r[colName])
      .filter((v) => v !== null && v !== undefined);
    if (!values.length) {
      return false;
    }

    return values.every(
      (v) => typeof v === "number" || (!Number.isNaN(Number(v)) && v !== "")
    );
  };

  const validSuggestedX =
    suggestedX && columns.includes(suggestedX) ? suggestedX : null;
  const validSuggestedY =
    suggestedY &&
    columns.includes(suggestedY) &&
    isNumericColumn(suggestedY)
      ? suggestedY
      : null;

  if (validSuggestedX && validSuggestedY) {
    return { xColumn: validSuggestedX, yColumn: validSuggestedY };
  }

  const numericColumns = columns.filter(isNumericColumn);
  const nonNumericColumns = columns.filter((c) => !numericColumns.includes(c));

  const yColumn = validSuggestedY || numericColumns[0] || null;
  const xColumn = validSuggestedX || nonNumericColumns[0] || columns[0] || null;

  return { xColumn, yColumn };
};

const buildMermaidFromRows = (rows, chartType, chartTitle, xColumn, yColumn) => {
  if (!rows.length || !xColumn || !yColumn) {
    return "";
  }

  const limited = rows.slice(0, 20);
  const title = sanitizeMermaidText(chartTitle || "AI Analytics");

  if (chartType === "pie") {
    const lines = limited
      .map(
        (r) =>
          `  \"${sanitizeMermaidText(r[xColumn])}\" : ${
            Number(r[yColumn]) || 0
          }`
      )
      .join("\n");

    return `pie title ${title}\n${lines}`;
  }

  const labels = limited
    .map((r) => `\"${sanitizeMermaidText(r[xColumn])}\"`)
    .join(", ");
  const values = limited.map((r) => Number(r[yColumn]) || 0).join(", ");
  const seriesKeyword = chartType === "line" ? "line" : "bar";

  return [
    "xychart-beta",
    `  title \"${title}\"`,
    `  x-axis [${labels}]`,
    `  y-axis \"${sanitizeMermaidText(yColumn)}\" 0 --> auto`,
    `  ${seriesKeyword} [${values}]`,
  ].join("\n");
};

const buildSchemaSnapshot = async (sqlConnectionTableCreator) => {
  const schemaRows = await sqlConnectionTableCreator`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;

  const grouped = {};
  for (const row of schemaRows) {
    if (!grouped[row.table_name]) {
      grouped[row.table_name] = [];
    }
    grouped[row.table_name].push(`${row.column_name} (${row.data_type})`);
  }

  return Object.entries(grouped)
    .map(([table, columns]) => `${table}: ${columns.join(", ")}`)
    .join("\n");
};

const isRecoverableSqlError = (error) => {
  const message = String(error?.message || "");
  return (
    /must appear in the GROUP BY clause/i.test(message) ||
    /must be used in an aggregate function/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
};

const generateAnalyticsPlan = async (question, schemaSnapshot, correctionContext = null) => {
  const correctionHint = correctionContext
    ? `

Previous SQL failed. You MUST fix it.
Postgres error: ${correctionContext.errorMessage}
Previous SQL:
${correctionContext.previousSql}

Fix strategy:
- If aggregating with GROUP BY, every selected non-aggregated column must be in GROUP BY.
- For time-based trends, prefer date_trunc('day'|'week'|'month', timestamp_column) and group by that expression.
- Keep output compact and analytics-friendly.`
    : "";

  const systemContent = `You are a senior data analyst. Convert the user's analytics question into safe PostgreSQL SQL.

Rules:
- Output STRICT JSON only — no prose, no markdown fences.
- Use only SELECT queries (or WITH + SELECT).
- No DDL/DML.
- Use table and column names exactly as they appear in the schema.
- Add reasonable aggregations/grouping for analytics questions.
- Keep result sets compact (aggregated whenever possible).
- When using GROUP BY, every non-aggregated selected column must be grouped.

Schema:
${schemaSnapshot}

${correctionHint}

Return ONLY this JSON object and nothing else:
{"sql":"SELECT ...","chartType":"bar|line|pie|table","title":"short chart title","xColumn":"column_for_x_axis","yColumn":"numeric_column_for_y_axis","insight":"one sentence summary"}`;

  // LLaMa 3 instruction format required by Bedrock
  const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

${systemContent}<|eot_id|><|start_header_id|>user<|end_header_id|>

${question}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;

  const payload = {
    prompt,
    temperature: 0.1,
    top_p: 0.9,
    max_gen_len: 1024,
  };

  const response = await bedrockRuntime.send(
    new InvokeModelCommand({
      modelId: ADMIN_ANALYTICS_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    })
  );

  const rawBody = Buffer.from(response.body).toString("utf-8");
  const parsedBody = JSON.parse(rawBody);
  const generation =
    parsedBody.generation ||
    parsedBody.output_text ||
    (Array.isArray(parsedBody.outputs) ? parsedBody.outputs[0]?.text : "") ||
    "";

  console.log("[ai_analytics] Raw Bedrock response:", JSON.stringify(parsedBody));
  console.log("[ai_analytics] Generation text:", generation);

  const plan = extractJson(generation);
  if (!plan) {
    throw new Error(
      `Failed to parse AI response into analytics plan. Response: ${generation.substring(0, 500)}`
    );
  }

  return plan;
};

const handleAiAnalyticsQuery = async (sqlConnectionTableCreator, question) => {
  const schemaSnapshot = await buildSchemaSnapshot(sqlConnectionTableCreator);
  let analyticsPlan = await generateAnalyticsPlan(question, schemaSnapshot);
  let sql = validateAndNormalizeSql(analyticsPlan.sql);

  let queryRows;
  try {
    queryRows = await sqlConnectionTableCreator.unsafe(sql);
  } catch (error) {
    if (!isRecoverableSqlError(error)) {
      throw error;
    }

    console.warn("[ai_analytics] Retrying SQL generation after recoverable DB error", {
      message: error?.message,
    });

    analyticsPlan = await generateAnalyticsPlan(question, schemaSnapshot, {
      previousSql: sql,
      errorMessage: String(error?.message || "Unknown SQL error"),
    });
    sql = validateAndNormalizeSql(analyticsPlan.sql);
    queryRows = await sqlConnectionTableCreator.unsafe(sql);
  }

  const rows = Array.isArray(queryRows) ? queryRows : [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const requestedChartType = String(analyticsPlan.chartType || "bar").toLowerCase();
  const chartType = ["bar", "line", "pie", "table"].includes(requestedChartType)
    ? requestedChartType
    : "bar";

  const { xColumn, yColumn } = pickChartColumns(
    rows,
    analyticsPlan.xColumn,
    analyticsPlan.yColumn
  );

  const mermaid =
    chartType === "table"
      ? ""
      : buildMermaidFromRows(rows, chartType, analyticsPlan.title, xColumn, yColumn);

  return {
    sql,
    summary: analyticsPlan.insight || "",
    columns,
    rows,
    chart: {
      type: chartType,
      title: analyticsPlan.title || "AI Analytics",
      xColumn,
      yColumn,
      mermaid,
    },
  };
};

module.exports = {
  handleAiAnalyticsQuery,
};
