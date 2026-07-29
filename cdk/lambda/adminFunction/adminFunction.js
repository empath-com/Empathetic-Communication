const { initializeConnection } = require("./libadmin.js");
const { createRoleRequestHandler } = require("../lib/shared/requestPipeline");
const { routeDomains } = require("./routeDomains");

let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, CORS_ALLOWED_ORIGIN = "*" } = process.env;

async function getAdminDbConnection() {
  if (!global.sqlConnectionTableCreator) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
  }
  return global.sqlConnectionTableCreator;
}

exports.handler = createRoleRequestHandler({
  corsAllowedOrigin: CORS_ALLOWED_ORIGIN,
  routeDomains,
  role: "admin",
  service: "admin-lambda",
  getDbConnection: getAdminDbConnection,
  auth: {
    enabled: false,
  },
});