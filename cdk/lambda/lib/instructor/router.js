const { CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");
const { formatNames, generateAccessCode } = require("../shared/utils.js");
const { freshResponse, ensureDbConnection, lookupUserEmail, dispatchRoute, makeResponse } = require("../shared/runtime.js");

// Import all route modules
const groupRoutes = require("./groupRoutes.js");
const patientRoutes = require("./patientRoutes.js");
const studentRoutes = require("./studentRoutes.js");
const promptRoutes = require("./promptRoutes.js");
const accessRoutes = require("./accessRoutes.js");
const completionRoutes = require("./completionRoutes.js");
const empathyRoutes = require("./empathyRoutes.js");
const voiceRoutes = require("./voiceRoutes.js");

// Merge all routes into a single lookup
const allRoutes = {
  ...groupRoutes,
  ...patientRoutes,
  ...studentRoutes,
  ...promptRoutes,
  ...accessRoutes,
  ...completionRoutes,
  ...empathyRoutes,
  ...voiceRoutes,
};

let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, USER_POOL, CORS_ALLOWED_ORIGIN = "*" } = process.env;

exports.handler = async (event) => {
  const cognito_id = event.requestContext.authorizer.userId;
  const client = new CognitoIdentityProviderClient();
  const userEmailAttribute = await lookupUserEmail(client, USER_POOL, cognito_id);

  // Reject if the caller is querying data for a different user.
  const queryStringParams = event.queryStringParameters || {};
  const queryEmail = queryStringParams.email;
  const instructorEmail = queryStringParams.instructor_email;

  const isUnauthorized =
    (queryEmail && queryEmail !== userEmailAttribute) ||
    (instructorEmail && instructorEmail !== userEmailAttribute);

  if (isUnauthorized) {
    return makeResponse(401, { error: "Unauthorized" }, CORS_ALLOWED_ORIGIN);
  }

  const response = freshResponse(CORS_ALLOWED_ORIGIN);
  const sqlConnection = await ensureDbConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);

  try {
    const pathData = event.httpMethod + " " + event.resource;
    await dispatchRoute(allRoutes, pathData, {
      event,
      sqlConnection,
      response,
      userEmailAttribute,
      formatNames,
      generateAccessCode,
    }, response);
  } catch (error) {
    response.statusCode = 400;
    response.body = JSON.stringify(error.message);
  }
  console.log(response);

  return response;
};

