const { CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");
const { freshResponse, lookupUserEmail } = require("./runtime");
const {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  toOperationalError,
} = require("./errors");

function createRouteDefinition({
  key,
  domain,
  handler,
  requiredQueryParams = [],
  description = "",
}) {
  return {
    key,
    domain,
    handler,
    requiredQueryParams,
    description,
  };
}

function createDomainRoutes(domain, routes, routeValidation = {}) {
  return Object.entries(routes).map(([key, handler]) =>
    createRouteDefinition({
      key,
      domain,
      handler,
      requiredQueryParams: routeValidation[key] || [],
    })
  );
}

function buildRouteMap(domainDefinitions) {
  const routeMap = {};
  for (const domainDefinition of domainDefinitions) {
    for (const routeDefinition of domainDefinition.routes) {
      routeMap[routeDefinition.key] = routeDefinition;
    }
  }
  return routeMap;
}

function validateRequiredQueryParams(event, requiredQueryParams) {
  const query = event.queryStringParameters || {};
  const missing = requiredQueryParams.filter((param) => {
    const value = query[param];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    throw new BadRequestError(`Missing required query parameter(s): ${missing.join(", ")}`);
  }
}

function enforceQueryOwnership(event, userEmailAttribute, ownedQueryParams = []) {
  if (!ownedQueryParams.length) return;

  const query = event.queryStringParameters || {};
  for (const param of ownedQueryParams) {
    const value = query[param];
    if (value && value !== userEmailAttribute) {
      throw new UnauthorizedError("Unauthorized");
    }
  }
}

function makeErrorBody(error) {
  const body = {
    error: error.message,
    code: error.code,
  };

  if (error.details) {
    body.details = error.details;
  }

  return JSON.stringify(body);
}

function createRoleRequestHandler({
  corsAllowedOrigin = "*",
  getDbConnection,
  routeDomains,
  auth = {
    enabled: false,
  },
  context = {},
}) {
  const routeMap = buildRouteMap(routeDomains);

  return async (event) => {
    const response = freshResponse(corsAllowedOrigin);

    try {
      const sqlConnection = await getDbConnection();

      let userEmailAttribute = null;
      if (auth.enabled) {
        const cognitoId = event?.requestContext?.authorizer?.userId;
        if (!cognitoId) {
          throw new UnauthorizedError("Unauthorized");
        }

        const userPoolId = auth.userPoolId;
        if (!userPoolId) {
          throw new UnauthorizedError("Unauthorized");
        }

        const cognitoClient = auth.cognitoClient || new CognitoIdentityProviderClient();
        userEmailAttribute = await lookupUserEmail(cognitoClient, userPoolId, cognitoId);
        if (!userEmailAttribute) {
          throw new UnauthorizedError("Unauthorized");
        }

        enforceQueryOwnership(event, userEmailAttribute, auth.ownedQueryParams || []);
      }

      const pathData = `${event.httpMethod} ${event.resource}`;
      const routeDefinition = routeMap[pathData];

      if (!routeDefinition) {
        throw new NotFoundError(`Unsupported route: \"${pathData}\"`);
      }

      validateRequiredQueryParams(event, routeDefinition.requiredQueryParams || []);

      const handlerResult = await routeDefinition.handler({
        event,
        sqlConnection,
        response,
        userEmailAttribute,
        ...context,
      });

      if (handlerResult !== undefined && response.body === "") {
        response.body = JSON.stringify(handlerResult);
      }

      if (response.body === "") {
        response.body = JSON.stringify({ ok: true });
      }
    } catch (error) {
      const operationalError = toOperationalError(error);
      response.statusCode = operationalError.statusCode;
      response.body = makeErrorBody(operationalError);
    }

    return response;
  };
}

module.exports = {
  createRouteDefinition,
  createDomainRoutes,
  buildRouteMap,
  createRoleRequestHandler,
};
