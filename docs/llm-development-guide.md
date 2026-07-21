# LLM Development Guide

Guidelines for AI coding assistants (Claude Code, Copilot, Cursor, etc.) working on this codebase. These patterns keep the repo navigable and prevent the accumulation of monolithic files.

## Module Size Rules

- **Max ~400 lines** per source file. If a file grows past 500 lines, split it.
- Prefer many small, focused files over fewer large ones.
- Each file should have a single clear responsibility describable in one sentence.

## Architecture Diagram Update Contract

- `docs/architectureDeepDive.md` must stay in sync with architecture-impacting code changes.
- This is enforced by CI: `.github/workflows/architecture-diagram-guard.yml`.
- If your PR changes architecture-impacting paths, include an architecture doc update in the same PR.

Architecture-impacting paths (guarded):
- `cdk/bin/cdk.ts`
- `cdk/lib/**`
- `cdk/lambda/**`
- `cdk/text_generation/**`
- `cdk/data_ingestion/**`
- `cdk/socket-server/**`
- `cdk/OpenAPI_Swagger_Definition.yaml`
- `frontend/src/hooks/useAuth.js`
- `frontend/src/utils/voiceStream.js`

Minimum required update when impacted:
1. Update the runtime diagram and/or control-plane diagram as needed.
2. Update nearby explanatory bullets in the same document so text and diagrams match.

## Naming Conventions

### Lambda Route Modules (`cdk/lambda/lib/<role>/`)
- `<domain>Routes.js` — e.g., `patientRoutes.js`, `sessionRoutes.js`
- `router.js` — thin handler that delegates to route modules
- Route modules export an object mapping route keys (`"GET /student/patient"`) to async handler functions

### React Components (`frontend/src/`)
- Pages: `<Role><Action>.jsx` — e.g., `InstructorEditPatients.jsx`
- Sub-components: `<Descriptive>.jsx` — e.g., `ChatSidebar.jsx`, `ChatInput.jsx`
- Hooks: `use<Name>.js` in a `hooks/` directory — e.g., `hooks/useChatSessions.js`
- Shared styles: `styles.js` in the component directory

### CDK Constructs (`cdk/lib/constructs/`)
- `<resource-type>.ts` — e.g., `cognito-auth.ts`, `api-gateway.ts`, `monitoring.ts`
- Export helper functions, not L3 constructs (simpler, fewer abstractions)

### Python Modules (`cdk/text_generation/src/helpers/`)
- `<domain>.py` — e.g., `prompts.py`, `empathy.py`, `streaming.py`
- Facade files re-export for backwards compatibility

## Code Patterns

### Lambda Route Handler Pattern
Each route module exports handlers keyed by route string:
```js
// cdk/lambda/lib/instructor/patientRoutes.js
const routes = {
  "POST /instructor/create_patient": async ({ event, sqlConnection, response, formatNames }) => {
    // business logic — mutate response.statusCode and response.body
    return response;
  },
};
module.exports = routes;
```

The router (`router.js`) merges all route modules and dispatches:
```js
const allRoutes = { ...groupRoutes, ...patientRoutes, ... };
const routeHandler = allRoutes[pathData];
if (routeHandler) await routeHandler({ event, sqlConnection, response, ... });
```

### React Hook Extraction Pattern
Extract business logic into custom hooks, keep components focused on rendering:
```jsx
// hooks/useChatSessions.js — manages session state and CRUD
export function useChatSessions({ patientId, enrolmentId, ... }) {
  const [sessions, setSessions] = useState([]);
  // ... effects, handlers
  return { sessions, activeSession, handleNewChat, handleDeleteSession };
}
```

The page component composes hooks and sub-components:
```jsx
function StudentChat() {
  const { sessions, ... } = useChatSessions({ ... });
  const { messages, ... } = useChatMessages({ ... });
  return (
    <ChatSidebar sessions={sessions} ... />
    <ChatMessageArea messages={messages} ... />
    <ChatInput onSubmit={handleSubmit} ... />
  );
}
```

### CDK Construct Helper Pattern
Export functions that create resources and return references:
```ts
// cdk/lib/constructs/cognito-auth.ts
export function createCognitoAuth(scope: Construct, id: string, props: { ... }) {
  const userPool = new cognito.UserPool(scope, ...);
  // ... more resources
  return { userPool, appClient, identityPool, secret };
}
```

The stack orchestrator calls helpers in order:
```ts
const { userPool, ... } = createCognitoAuth(this, id, { ... });
const { api, ... } = createApiGateway(this, id, { userPool, ... });
```

### Python Domain Module Pattern
Split by domain, use a facade for backwards compatibility:
```python
# helpers/prompts.py — pure prompt templates
# helpers/empathy.py — empathy evaluation logic
# helpers/streaming.py — AppSync publishing
# helpers/chat.py — re-export facade: from .prompts import *; from .empathy import *; ...
```

## Code Navigation

### Finding the handler for an API route
1. Identify the role prefix: `/instructor/...`, `/student/...`, `/admin/...`
2. Go to `cdk/lambda/lib/<role>/` directory
3. Find the `<domain>Routes.js` file matching the resource domain
4. Search for the full route key, e.g., `"GET /instructor/groups"`

### Finding the React component for a page
1. Identify the user role from the URL: `/admin/...`, `/instructor/...`, `/student/...`
2. Go to `frontend/src/pages/<role>/`
3. Page components are named `<Role><Feature>.jsx`
4. Sub-components and hooks are in the same directory or `hooks/` subdirectory

### Finding CDK resource definitions
1. Go to `cdk/lib/constructs/`
2. Match the AWS service to the construct file:
   - Cognito → `cognito-auth.ts`
   - API Gateway / WAF → `api-gateway.ts`
   - Lambda functions → `business-lambdas.ts` or `authorizer-lambdas.ts`
   - AppSync → `appsync-streaming.ts`
   - CloudWatch / EventBridge → `monitoring.ts`
   - Lambda layers → `lambda-layers.ts`

### Finding Python RAG/LLM logic
1. Go to `cdk/text_generation/src/helpers/`
2. Match the concern:
   - Prompt templates → `prompts.py`
   - Empathy scoring → `empathy.py`
   - AppSync streaming → `streaming.py`
   - Bedrock LLM setup → `llm.py`
   - Chat history / DB → `conversation.py`
   - RAG vectorstore → `vectorstore.py`

## Adding New Code

### Adding a new API route
1. Add the route handler to the appropriate `<domain>Routes.js` in `cdk/lambda/lib/<role>/`
2. If it's a new domain, create a new `<domain>Routes.js` and import it in `router.js`
3. Add the endpoint to `cdk/OpenAPI_Swagger_Definition.yaml`
4. Register any new Lambda in `cdk/lib/constructs/business-lambdas.ts`

### Adding a new React feature to an existing page
1. Create a custom hook in `<page>/hooks/use<Feature>.js` for business logic
2. Create a sub-component `<page>/<Feature>.jsx` for the UI
3. Wire them together in the page component
4. Do NOT add 200+ lines to an existing page file — extract instead

### Adding a new CDK resource
1. Find the appropriate construct file in `cdk/lib/constructs/`
2. Add the resource there, return it from the helper function
3. Update `api-service-stack.ts` to consume the new return value if needed
4. If the resource doesn't fit existing constructs, create a new construct file

## Shared Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `formatNames` | `cdk/lambda/lib/shared/utils.js` | Lowercase + underscore name formatting |
| `generateAccessCode` | `cdk/lambda/lib/shared/utils.js` | Random 16-char access code |
| `initializeConnection` | `cdk/lambda/lib/lib.js` | PostgreSQL connection via RDS Proxy |
| `titleCase` | `frontend/src/utils/textFormatting.js` | Title case string formatting |
| `useAuth` | `frontend/src/hooks/useAuth.js` | AWS Amplify auth hook |

## Backwards Compatibility

When splitting a file:
1. Keep the original filename as a **re-export facade** (one-liner that re-exports from the new location)
2. This ensures no other files need import path changes
3. Example: `instructorFunction.js` → `module.exports = require('./instructor/router');`
4. Example: `chat.py` → `from .prompts import *; from .empathy import *; ...`
