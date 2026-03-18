# Empathetic Communication — Claude Code Guide

## Project Overview
Generative AI tool on AWS that helps healthcare students practice empathetic communication skills. Uses RAG + LLMs (AWS Bedrock) to create realistic patient training scenarios, deliver structured empathy feedback, and track student/instructor progress.

## Architecture Summary
- **Frontend**: React 18 + Vite + Tailwind CSS + MUI (deployed on AWS Amplify)
- **Backend**: AWS CDK (TypeScript) defining all infrastructure
- **Lambda**: JavaScript (Node.js) + Python containers (Docker) for business logic
- **AI/ML**: AWS Bedrock (RAG), Nova Sonic (voice), LLaMa 3 70B
- **Database**: PostgreSQL + pgvector on RDS (accessed via Lambda layers)
- **Real-time**: Socket.IO server on ECS Fargate (for voice/chat streaming)
- **Auth**: Amazon Cognito (admin / instructor / student roles)
- **Storage**: S3 (embeddings, profile pictures, documents)
- **API**: REST (API Gateway) + GraphQL (AppSync) + WebSocket (Socket.IO)

## Directory Structure
```
cdk/                        # AWS CDK infrastructure (TypeScript)
  bin/                      # CDK app entry point
  lib/                      # Stack definitions
    api-service-stack.ts    # Orchestrator — imports from constructs/
    vpc-stack.ts            # VPC networking
    database-stack.ts       # RDS PostgreSQL + pgvector
    ecs-socket-stack.ts     # ECS Fargate for Socket.IO server
    amplify-stack.ts        # Frontend hosting
    cicd-stack.ts           # CI/CD pipeline
    constructs/             # CDK construct helpers (split from api-service-stack)
      cognito-auth.ts       # User pool, identity pool, IAM roles
      lambda-layers.ts      # All Lambda layer definitions
      api-gateway.ts        # OpenAPI processing, SpecRestApi, WAF
      authorizer-lambdas.ts # Admin/instructor/student authorizers
      business-lambdas.ts   # All business Lambda functions, S3, SSM
      appsync-streaming.ts  # AppSync GraphQL API and resolvers
      monitoring.ts         # CloudWatch, EventBridge, timeout handler
  lambda/                   # Node.js Lambda functions
    lib/
      shared/utils.js       # Shared utilities (formatNames, generateAccessCode)
      lib.js                # DB connection initialization
      instructor/           # Instructor route modules
        router.js           # Auth + route dispatch
        groupRoutes.js      # Group/analytics routes
        patientRoutes.js    # Patient CRUD routes
        studentRoutes.js    # Student management routes
        promptRoutes.js     # System prompt routes
        accessRoutes.js     # Access code routes
        completionRoutes.js # Completion status routes
        empathyRoutes.js    # Empathy summary routes
        voiceRoutes.js      # Voice settings routes
      student/              # Student route modules
        router.js           # Auth + route dispatch
        userRoutes.js       # User creation/roles routes
        groupRoutes.js      # Simulation group routes
        patientRoutes.js    # Patient data routes
        sessionRoutes.js    # Session CRUD routes
        messageRoutes.js    # Message creation routes
        enrollmentRoutes.js # Student enrollment routes
        progressRoutes.js   # Score/completion routes
        notesRoutes.js      # Notes routes
        empathyRoutes.js    # Empathy summary/enabled routes
        voiceRoutes.js      # Voice enabled routes
      instructorFunction.js # Re-export → instructor/router.js
      studentFunction.js    # Re-export → student/router.js
    adminFunction/          # Admin-specific Lambda
    db_setup/               # DB initialization
    deleteFile/ deleteLastMessage/ deletePatient/ generatePreSignedURL/
    getFilesFunction/ getProfilePictures/ timeoutHandler/
    adminAuthorizerFunction/ instructorAuthorizerFunction/ studentAuthorizerFunction/
  text_generation/          # Python Docker container — RAG text generation
    src/
      main.py               # Entry point
      helpers/
        chat.py             # Re-export facade for backwards compatibility
        prompts.py          # Prompt templates (patient + empathy)
        empathy.py          # Empathy evaluation and scoring
        streaming.py        # AppSync publishing, streaming responses
        llm.py              # Bedrock LLM factory
        conversation.py     # Chat history, message DB ops, RAG chain
        db_connection_manager.py
        helper.py
        resilience.py       # Retry/resilience logic
        vectorstore.py      # pgvector RAG retrieval
  data_ingestion/           # Python Docker container — document ingestion for RAG
  socket-server/            # Node.js Socket.IO server (ECS) — voice + real-time chat
    server.js               # Main server
    nova_sonic.py           # AWS Nova Sonic voice integration
    langchain_chat_history.py
    voice_db_manager.py
  layers/                   # Lambda layers (shared dependencies)
  OpenAPI_Swagger_Definition.yaml  # API spec

frontend/                   # React SPA
  src/
    hooks/
      useAuth.js            # AWS Amplify auth hook
    pages/
      auth/                 # Auth flow components (split from Login.jsx)
        useAuthFlow.js      # Auth state machine hook
        LoginForm.jsx       # Sign-in form
        SignUpForm.jsx       # Sign-up form
        ConfirmSignUpForm.jsx # Confirmation code form
        ForgotPasswordForm.jsx # Password reset flow
        NewPasswordForm.jsx # Admin-created user password
        styles.js           # Shared MUI styles
      admin/                # Admin pages
      instructor/           # Instructor pages
      student/              # Student pages
        StudentChat.jsx     # Composition root for chat
        hooks/              # Chat-specific hooks
          useChatSessions.js  # Session CRUD
          useChatMessages.js  # Message state, streaming
          useEmpathyCoach.js  # Empathy evaluation
          useSidebarResize.js # Sidebar resize
        ChatSidebar.jsx     # Session list sidebar
        ChatTopBar.jsx      # Top bar UI
        ChatMessageArea.jsx # Message list
        ChatInput.jsx       # Text input area
      Login.jsx             # Thin wrapper rendering auth forms
    components/             # Shared React components
    functions/              # Utility functions (auth, S3, image)
    utils/                  # Helpers
      textFormatting.js     # titleCase, string utilities
  vite.config.js
  tailwind.config.js

docs/                       # Architecture, deployment, troubleshooting guides
  llm-development-guide.md  # LLM coding guidelines and patterns
```

## Tech Stack Details

### Frontend
- React 18, React Router v6, Vite 5
- Tailwind CSS (v3) + MUI v5 + Emotion
- AWS Amplify v6 (auth/hosting), AWS SDK v3 (S3, Bedrock, Cognito)
- Socket.IO client v4, Recharts, React Toastify, React Markdown
- PDF export: jspdf + html2canvas

### CDK / Infrastructure
- AWS CDK v2 (TypeScript ~5.4)
- `npm run build` — compile TypeScript
- `npm test` — run CDK unit tests (Jest)
- `cdk deploy` — deploy stacks (requires AWS credentials + bootstrapped account)
- `docker-buildkit=0` is set in cdk.json (required for build compatibility)

### Lambda (Node.js)
- Runtime: Node.js (ESM where noted)
- Route handlers split by domain in `cdk/lambda/lib/<role>/<domain>Routes.js`
- Shared utilities in `cdk/lambda/lib/shared/utils.js`
- DB connection via `cdk/lambda/lib/lib.js`
- Authorizers: separate Lambda per role (admin/instructor/student)

### Python Containers (text_generation, data_ingestion)
- Python with Poetry (`pyproject.toml`) and pip (`requirements.txt`)
- Docker-based, deployed as Lambda container images or ECS tasks
- Entry: `src/main.py`
- pgvector for embedding storage and similarity search

### Socket Server (ECS Fargate)
- Node.js + Express + Socket.IO v4
- AWS SDK v2 + v3 mixed usage
- JWT auth via `jsonwebtoken` + `jwks-rsa`
- Nova Sonic integration for voice streaming

## Build & Run Commands

### Frontend
```bash
cd frontend
npm install
npm run dev        # local dev server
npm run build      # production build
npm run lint       # ESLint check
```

### CDK
```bash
cd cdk
npm install
npm run build      # compile TypeScript
npm test           # run Jest tests
cdk synth          # synthesize CloudFormation
cdk deploy --all   # deploy all stacks (⚠️ affects live AWS infra)
```

### Socket Server
```bash
cd cdk/socket-server
npm install
node server.js
```

## Key Configuration Files
- `cdk/cdk.json` — CDK app config and feature flags
- `cdk/cdk.context.json` — CDK context (account/region values)
- `frontend/vite.config.js` — Vite config (proxy, build settings)
- `frontend/tailwind.config.js` — Tailwind theme
- `frontend/components.json` — shadcn/ui component config
- `.claude/settings.local.json` — local Claude Code permissions (gitignored)

## AWS Services in Use
API Gateway, AppSync (GraphQL), Lambda, ECS Fargate, RDS (PostgreSQL), S3, Cognito, Bedrock, Secrets Manager, SSM Parameter Store, CloudWatch, EventBridge, WAFv2, VPC, ECR, Amplify

## Coding Conventions

### General
- No `console.log` in production code; use structured logging where possible
- Secrets always via AWS Secrets Manager or SSM — never hardcoded
- CORS origin is configurable via `corsAllowedOrigin` CDK parameter

### Frontend (React)
- Functional components with hooks only
- JSX files (`.jsx`), not TypeScript
- Tailwind for layout/spacing; MUI for complex UI components
- AWS Amplify auth flow for login/logout

### Lambda (Node.js)
- CommonJS (`require`) style in most Lambda functions
- Shared utilities imported from `cdk/lambda/lib/lib.js`
- DB access is always through the shared layer (no direct pg connections in Lambda handlers)

### Python (text_generation / data_ingestion)
- PEP 8 style
- Poetry for dependency management (`pyproject.toml`)
- pgvector + LangChain patterns for RAG

## User Roles
- **Admin**: manages instructors and system config
- **Instructor**: creates patient scenarios, views student progress, uploads documents for RAG
- **Student**: practices conversations with AI patient, receives empathy feedback

## Empathy Evaluation System
Scores conversations across key empathy dimensions. See [docs/empathy-coach-deepdive.md](docs/empathy-coach-deepdive.md) for scoring methodology and prompt engineering details.

## Deployment Notes
- **NEVER run any deploy command.** Deployment is always performed manually by the user in a terminal outside the IDE. AI models must not trigger deployments under any circumstances, even if explicitly asked to do so.
- Full deployment guide: [docs/deploymentGuide.md](docs/deploymentGuide.md)
- Docker BuildKit is disabled (`"docker-buildkit": "0"`) in cdk.json — keep this
- The `settings.local.json` is gitignored; do not commit it
- Cross-account and cross-region deployment documented in `docs/`

### Staging Deploy Command
```bash
cd cdk && npx aws-cdk deploy --all \
  --parameters EmpathAI-VpcStack:vpcId=vpc-0bf1300023e21d56d \
  --parameters EmpathAI-VpcStack:subnetPrefix=dts-phar-empath-ai-stg \
  --parameters EmpathAI-Amplify:githubRepoName=EMPATHETIC-COMMUNICATION \
  --parameters EmpathAI-Amplify:socketUrl=wss://ws.staging.empath-ai.pharmsci.ubc.ca \
  --context StackPrefix=EmpathAI \
  --profile empath-staging \
  --require-approval never
```

Key staging values:
- **Stack prefix**: `EmpathAI` (stacks named `EmpathAI-VpcStack`, `EmpathAI-Amplify`, etc.)
- **VPC ID**: `vpc-0bf1300023e21d56d` (existing VPC, not created by CDK)
- **Subnet prefix**: `dts-phar-empath-ai-stg`
- **GitHub repo name**: `EMPATHETIC-COMMUNICATION`
- **Socket URL**: `wss://ws.staging.empath-ai.pharmsci.ubc.ca`
- **AWS profile**: `empath-staging`

### Production Deploy Command
```bash
cd cdk && npx aws-cdk deploy --all \
  --parameters EmpathAI-VpcStack:vpcId=vpc-06dabb93e0ed16197 \
  --parameters EmpathAI-VpcStack:subnetPrefix=prd-phar-empath-ai-prd \
  --parameters EmpathAI-Amplify:githubRepoName=EMPATHETIC-COMMUNICATION \
  --parameters EmpathAI-Amplify:socketUrl=wss://ws.empath-ai.pharmsci.ubc.ca \
  --context StackPrefix=EmpathAI \
  --profile empath-prod \
  --require-approval never
```

Key production values:
- **Stack prefix**: `EmpathAI`
- **VPC ID**: `vpc-06dabb93e0ed16197` (existing VPC, not created by CDK)
- **Subnet prefix**: `prd-phar-empath-ai-prd`
- **GitHub repo name**: `EMPATHETIC-COMMUNICATION`
- **Socket URL**: `wss://ws.empath-ai.pharmsci.ubc.ca`
- **AWS profile**: `empath-prod`

## Testing
- CDK unit tests: `cd cdk && npm test` (Jest + ts-jest)
- No automated frontend tests currently (manual testing via dev server)
- Lambda functions tested manually via AWS Console or test events

## Module Size Guidelines

- **Max ~400 lines** per source file. Split at 500+ lines.
- See [docs/llm-development-guide.md](docs/llm-development-guide.md) for splitting patterns and naming conventions.
- When splitting a file, keep the original filename as a **re-export facade** for backwards compatibility.

## Code Navigation

### API route → handler file
1. Route prefix tells you the role: `/instructor/...` → `cdk/lambda/lib/instructor/`
2. Domain tells you the file: patient routes → `patientRoutes.js`, session routes → `sessionRoutes.js`
3. Search for the full route key: `"GET /instructor/groups"`

### Page URL → React component
- `/admin/...` → `frontend/src/pages/admin/`
- `/instructor/...` → `frontend/src/pages/instructor/`
- `/student/...` → `frontend/src/pages/student/`
- Login/auth → `frontend/src/pages/Login.jsx` + `frontend/src/pages/auth/`

### CDK resource → construct file
- Cognito → `cdk/lib/constructs/cognito-auth.ts`
- API Gateway / WAF → `cdk/lib/constructs/api-gateway.ts`
- Lambda functions → `cdk/lib/constructs/business-lambdas.ts`
- Authorizers → `cdk/lib/constructs/authorizer-lambdas.ts`
- AppSync → `cdk/lib/constructs/appsync-streaming.ts`
- Monitoring → `cdk/lib/constructs/monitoring.ts`

### Python RAG/LLM → helper file
- Prompt templates → `cdk/text_generation/src/helpers/prompts.py`
- Empathy scoring → `cdk/text_generation/src/helpers/empathy.py`
- Streaming → `cdk/text_generation/src/helpers/streaming.py`
- LLM setup → `cdk/text_generation/src/helpers/llm.py`
- Chat history → `cdk/text_generation/src/helpers/conversation.py`

## Common Tasks

### Adding a new API route to an existing Lambda
1. Add the handler to the appropriate `<domain>Routes.js` in `cdk/lambda/lib/<role>/`
2. If it's a new domain, create `<domain>Routes.js` and import it in `router.js`
3. Add the endpoint to `cdk/OpenAPI_Swagger_Definition.yaml`

### Adding a new standalone Lambda function
1. Create function file in `cdk/lambda/<functionName>/`
2. Register it in `cdk/lib/constructs/business-lambdas.ts`
3. Wire to API Gateway endpoint in `OpenAPI_Swagger_Definition.yaml`

### Adding a new React feature
1. Create a custom hook in `<page>/hooks/use<Feature>.js` for logic
2. Create a sub-component `<page>/<Feature>.jsx` for UI
3. Wire them in the page component — do NOT add 200+ lines to an existing file

### Modifying the empathy prompt
See [docs/promptModificationGuide.md](docs/promptModificationGuide.md)

### Modifying the database schema
See [docs/databaseModificationGuide.md](docs/databaseModificationGuide.md)
