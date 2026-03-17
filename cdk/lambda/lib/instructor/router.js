const { initializeConnection } = require("../lib.js");
const { formatNames, generateAccessCode } = require("../shared/utils.js");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

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

let sqlConnection = global.sqlConnection;

exports.handler = async (event) => {
  const cognito_id = event.requestContext.authorizer.userId;
  const client = new CognitoIdentityProviderClient();
  const userAttributesCommand = new AdminGetUserCommand({
    UserPoolId: USER_POOL,
    Username: cognito_id,
  });
  const userAttributesResponse = await client.send(userAttributesCommand);

  const emailAttr = userAttributesResponse.UserAttributes.find(
    (attr) => attr.Name === "email"
  );
  const userEmailAttribute = emailAttr ? emailAttr.Value : null;

  // Check for query string parameters
  const queryStringParams = event.queryStringParameters || {};
  const queryEmail = queryStringParams.email;
  const instructorEmail = queryStringParams.instructor_email;

  const isUnauthorized =
    (queryEmail && queryEmail !== userEmailAttribute) ||
    (instructorEmail && instructorEmail !== userEmailAttribute);

  if (isUnauthorized) {
    return {
      statusCode: 401,
      headers: {
        "Access-Control-Allow-Headers":
          "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "*",
      },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "*",
    },
    body: "",
  };

  // Initialize the database connection if not already initialized
  if (!sqlConnection) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnection = global.sqlConnection;
  }

  try {
    const pathData = event.httpMethod + " " + event.resource;

    const handler = allRoutes[pathData];
    if (handler) {
      await handler({
        event,
        sqlConnection,
        response,
        userEmailAttribute,
        formatNames,
        generateAccessCode,
      });
    } else {
      throw new Error(`Unsupported route: "${pathData}"`);
    }
  } catch (error) {
    response.statusCode = 400;
    response.body = JSON.stringify(error.message);
  }
  console.log(response);

  return response;
};
