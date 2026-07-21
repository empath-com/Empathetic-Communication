const { createAuthorizerHandler } = require("../lib/shared/authorizer");

exports.handler = createAuthorizerHandler("admin");

