/**
 * Shared Cognito JWT authorizer factory.
 *
 * Creates an AWS API Gateway Lambda authorizer handler that verifies a Cognito
 * ID token and allows invocation only when the token belongs to one of the
 * supplied Cognito groups.
 *
 * Usage (one-liner per authorizer file):
 *   const { createAuthorizerHandler } = require("../lib/shared/authorizer");
 *   exports.handler = createAuthorizerHandler(['admin']);
 */

const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const secretsManager = new SecretsManagerClient();

/**
 * Returns an API Gateway token authorizer Lambda handler that permits only
 * members of the given `allowedGroups`.
 *
 * @param {string | string[]} allowedGroups  Cognito group name(s) to permit.
 */
function createAuthorizerHandler(allowedGroups) {
  // Base response structure (mutated per invocation via Object.assign to avoid
  // cross-invocation bleed on the Statement array).
  const baseResponseStruct = {
    principalId: "yyyyyyyy",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [],
    },
    context: {},
  };

  // Verifier is initialized once on first cold start and cached for reuse.
  let jwtVerifier;

  async function initializeVerifier() {
    const { SM_COGNITO_CREDENTIALS } = process.env;
    try {
      const command = new GetSecretValueCommand({ SecretId: SM_COGNITO_CREDENTIALS });
      const secretResponse = await secretsManager.send(command);
      const credentials = JSON.parse(secretResponse.SecretString);

      jwtVerifier = CognitoJwtVerifier.create({
        userPoolId: credentials.VITE_COGNITO_USER_POOL_ID,
        tokenUse: "id",
        groups: allowedGroups,
        clientId: credentials.VITE_COGNITO_USER_POOL_CLIENT_ID,
      });
    } catch (error) {
      console.error("Error initializing JWT verifier:", error);
      throw new Error("Failed to initialize JWT verifier");
    }
  }

  return async function handler(event) {
    if (!jwtVerifier) {
      await initializeVerifier();
    }

    const accessToken = event.authorizationToken.toString();

    try {
      const payload = await jwtVerifier.verify(accessToken);

      // Wildcard resource covering all methods/stages in this API deployment.
      const parts = event.methodArn.split("/");
      const resource = parts.slice(0, 2).join("/") + "*";

      // Build a fresh response object each invocation so Statement accumulation
      // from one warm invocation doesn't bleed into the next.
      const response = {
        ...baseResponseStruct,
        policyDocument: {
          ...baseResponseStruct.policyDocument,
          Statement: [
            {
              Action: "execute-api:Invoke",
              Effect: "Allow",
              Resource: resource,
            },
          ],
        },
      };
      response.principalId = payload.sub;
      response.context = { userId: payload.sub };

      return response;
    } catch (error) {
      console.error("Authorization error:", error);
      // API Gateway expects exactly this error string to return 401 instead of 500.
      throw new Error("Unauthorized");
    }
  };
}

module.exports = { createAuthorizerHandler };
