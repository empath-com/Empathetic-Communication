const { initializeConnection } = require("./libadmin.js");
const { freshResponse } = require("../lib/shared/runtime.js");

// Domain route modules
const statsRoutes = require("./routes/statsRoutes.js");
const groupRoutes = require("./routes/groupRoutes.js");
const instructorRoutes = require("./routes/instructorRoutes.js");
const promptRoutes = require("./routes/promptRoutes.js");
const aiAnalyticsRoutes = require("./routes/aiAnalyticsRoutes.js");

const allRoutes = {
  ...statsRoutes,
  ...groupRoutes,
  ...instructorRoutes,
  ...promptRoutes,
  ...aiAnalyticsRoutes,
};

let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, CORS_ALLOWED_ORIGIN = "*" } = process.env;

// The admin function has its own DB connection global to maintain backward
// compatibility with libadmin.js which sets global.sqlConnectionTableCreator.
let sqlConnectionTableCreator = global.sqlConnectionTableCreator;

exports.handler = async (event) => {
  const response = freshResponse(CORS_ALLOWED_ORIGIN);

  if (!sqlConnectionTableCreator) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnectionTableCreator = global.sqlConnectionTableCreator;
  }

  try {
    const pathData = event.httpMethod + " " + event.resource;
    const handler = allRoutes[pathData];
    if (!handler) {
      console.error(`Unsupported route: "${pathData}"`);
      response.statusCode = 404;
      response.body = JSON.stringify({ error: `Unsupported route: "${pathData}"` });
    } else {
      await handler({ event, sqlConnection: sqlConnectionTableCreator, response });
    }
  } catch (error) {
    console.error("[Main catch block] Error:", error);
    response.statusCode = 400;
    response.body = JSON.stringify({ error: error.message });
  }
  console.log("[Response]", response);
  return response;
};