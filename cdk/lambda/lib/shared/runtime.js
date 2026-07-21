/**
 * Shared Lambda REST runtime helpers.
 *
 * Centralises the boilerplate that repeats across instructor, student, and
 * admin handler files: CORS response construction, lazy database acquisition,
 * and Cognito user-email lookup.
 *
 * Nothing in this module is AWS-region-specific; AWS SDK clients are
 * instantiated by callers so that they can be easily swapped in tests.
 */

const { AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { initializeConnection } = require("../lib.js");

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/**
 * Returns the standard API Gateway CORS headers for the given allowed origin.
 * @param {string} origin
 */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "*",
  };
}

/**
 * Builds a complete Lambda response object with CORS headers.
 * @param {number} statusCode
 * @param {string|object} body  String body or an object that will be JSON-serialised.
 * @param {string} origin       Value for Access-Control-Allow-Origin.
 */
function makeResponse(statusCode, body, origin) {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

/**
 * Returns a fresh mutable response object initialised to 200.
 * @param {string} origin
 */
function freshResponse(origin) {
  return { statusCode: 200, headers: corsHeaders(origin), body: "" };
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Ensures `global.sqlConnection` is populated, calling `initializeConnection`
 * on the first invocation.  Returns the connection object.
 * @param {string} SM_DB_CREDENTIALS
 * @param {string} RDS_PROXY_ENDPOINT
 */
async function ensureDbConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT) {
  if (!global.sqlConnection) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
  }
  return global.sqlConnection;
}

// ---------------------------------------------------------------------------
// Cognito helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the email attribute for a Cognito user identified by their sub/userId.
 *
 * @param {import("@aws-sdk/client-cognito-identity-provider").CognitoIdentityProviderClient} cognitoClient
 * @param {string} userPoolId
 * @param {string} userId  Cognito `sub` (as stored in the authorizer context).
 * @returns {Promise<string|null>}
 */
async function lookupUserEmail(cognitoClient, userPoolId, userId) {
  const command = new AdminGetUserCommand({ UserPoolId: userPoolId, Username: userId });
  const response = await cognitoClient.send(command);
  const attr = (response.UserAttributes || []).find((a) => a.Name === "email");
  return attr ? attr.Value : null;
}

// ---------------------------------------------------------------------------
// Route dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatches to the matching route handler or throws if no route is registered.
 *
 * @param {Record<string, Function>} routes      Route map keyed by "METHOD /path".
 * @param {string}                   pathData    e.g. "GET /instructor/groups"
 * @param {object}                   handlerCtx  Context object forwarded to the handler.
 * @param {object}                   response    Mutable response to modify.
 */
async function dispatchRoute(routes, pathData, handlerCtx, response) {
  const handler = routes[pathData];
  if (!handler) {
    throw new Error(`Unsupported route: "${pathData}"`);
  }
  await handler(handlerCtx);
}

module.exports = {
  corsHeaders,
  makeResponse,
  freshResponse,
  ensureDbConnection,
  lookupUserEmail,
  dispatchRoute,
};
