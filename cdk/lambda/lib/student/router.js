const { initializeConnection } = require("../lib.js");
const { formatNames } = require("../shared/utils.js");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

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
  const studentEmail = queryStringParams.student_email;
  const userEmail = queryStringParams.user_email;

  const isUnauthorized =
    (queryEmail && queryEmail !== userEmailAttribute) ||
    (studentEmail && studentEmail !== userEmailAttribute) ||
    (userEmail && userEmail !== userEmailAttribute);

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
      });
    } else {
      throw new Error(`Unsupported route: "${pathData}"`);
    }
  } catch (error) {
    response.statusCode = 400;
    console.log(error);
    response.body = JSON.stringify(error.message);
  }
  console.log(response);

  return response;
};
