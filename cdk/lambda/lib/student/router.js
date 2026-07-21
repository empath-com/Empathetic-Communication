const { CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");
const { formatNames } = require("../shared/utils.js");
const { freshResponse, ensureDbConnection, lookupUserEmail, dispatchRoute, makeResponse } = require("../shared/runtime.js");

// Import all route modules
const userRoutes = require("./userRoutes.js");
const groupRoutes = require("./groupRoutes.js");
const patientRoutes = require("./patientRoutes.js");
const sessionRoutes = require("./sessionRoutes.js");
const messageRoutes = require("./messageRoutes.js");
const enrollmentRoutes = require("./enrollmentRoutes.js");
const progressRoutes = require("./progressRoutes.js");
const notesRoutes = require("./notesRoutes.js");
const empathyRoutes = require("./empathyRoutes.js");
const voiceRoutes = require("./voiceRoutes.js");

// Merge all routes into a single lookup
const allRoutes = {
  ...userRoutes,
  ...groupRoutes,
  ...patientRoutes,
  ...sessionRoutes,
  ...messageRoutes,
  ...enrollmentRoutes,
  ...progressRoutes,
  ...notesRoutes,
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
  const studentEmail = queryStringParams.student_email;
  const userEmail = queryStringParams.user_email;

  const isUnauthorized =
    (queryEmail && queryEmail !== userEmailAttribute) ||
    (studentEmail && studentEmail !== userEmailAttribute) ||
    (userEmail && userEmail !== userEmailAttribute);

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
    }, response);
  } catch (error) {
    response.statusCode = 400;
    console.log(error);
    response.body = JSON.stringify(error.message);
  }
  console.log(response);

  return response;
};

