const { createAuthorizerHandler } = require("../lib/shared/authorizer");

exports.handler = createAuthorizerHandler(["instructor", "admin"]);

