const { createDomainRoutes } = require("../lib/shared/requestPipeline");

const statsRoutes = require("./routes/statsRoutes.js");
const groupRoutes = require("./routes/groupRoutes.js");
const instructorRoutes = require("./routes/instructorRoutes.js");
const promptRoutes = require("./routes/promptRoutes.js");
const aiAnalyticsRoutes = require("./routes/aiAnalyticsRoutes.js");

const routeDomains = [
  { domain: "stats", routes: createDomainRoutes("stats", statsRoutes) },
  { domain: "groups", routes: createDomainRoutes("groups", groupRoutes) },
  { domain: "instructors", routes: createDomainRoutes("instructors", instructorRoutes) },
  { domain: "prompts", routes: createDomainRoutes("prompts", promptRoutes) },
  { domain: "ai-analytics", routes: createDomainRoutes("ai-analytics", aiAnalyticsRoutes) },
];

module.exports = { routeDomains };
