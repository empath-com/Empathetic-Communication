const { createAuthorizerHandler } = require("../lib/shared/authorizer");

exports.handler = createAuthorizerHandler(["student", "instructor", "admin"]);

