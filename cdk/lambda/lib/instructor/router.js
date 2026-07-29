const { formatNames, generateAccessCode } = require("../shared/utils.js");
const { ensureDbConnection } = require("../shared/runtime.js");
const { createRoleRequestHandler } = require("../shared/requestPipeline");
const { routeDomains } = require("./domains");

let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, USER_POOL, CORS_ALLOWED_ORIGIN = "*" } = process.env;

exports.handler = createRoleRequestHandler({
  corsAllowedOrigin: CORS_ALLOWED_ORIGIN,
  routeDomains,
  role: "instructor",
  service: "instructor-lambda",
  getDbConnection: () => ensureDbConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT),
  auth: {
    enabled: true,
    userPoolId: USER_POOL,
    ownedQueryParams: ["email", "instructor_email"],
  },
  context: {
    formatNames,
    generateAccessCode,
  },
});

