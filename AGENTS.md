# Empathetic Communication - Agent Operating Guide

This file is the primary operating guide for autonomous coding agents working in this repository.

## Mission

Deliver safe, minimal, high-confidence changes to the Empathetic Communication platform across:

- AWS CDK infrastructure (`cdk/`)
- Lambda and containerized backend services (`cdk/lambda/`, `cdk/text_generation/`, `cdk/data_ingestion/`, `cdk/socket-server/`)
- React frontend (`frontend/`)
- technical documentation (`docs/`)

## Non-Negotiable Guardrails

1. Never run deployment commands (`cdk deploy`, `aws cloudformation deploy`, production release scripts).
2. Never hardcode secrets, tokens, passwords, ARNs with credentials, or private keys.
3. Preserve existing architecture and public APIs unless the task explicitly requires a breaking change.
4. Keep edits scoped; avoid broad refactors when fixing a targeted issue.
5. Validate changed areas with available tests/lint/build commands where feasible.

## Fast Repository Map

- `cdk/lib/constructs/`: infrastructure composition and resource wiring
- `cdk/lambda/lib/instructor/`: instructor REST route handlers
- `cdk/lambda/lib/student/`: student REST route handlers
- `cdk/lambda/lib/shared/`: shared Node.js utilities
- `cdk/text_generation/src/helpers/`: prompting, scoring, RAG, streaming
- `cdk/data_ingestion/src/`: ingestion pipeline
- `cdk/socket-server/`: realtime voice/chat Socket.IO service
- `frontend/src/pages/`: role-specific app screens
- `frontend/src/components/`: shared UI elements
- `docs/`: deployment and architecture references

## Task Routing Rules

### API behavior changes

- First inspect role router in `cdk/lambda/lib/<role>/router.js`.
- Add/update domain routes in `<domain>Routes.js`.
- If route surface changes, update `cdk/OpenAPI_Swagger_Definition.yaml`.

### Infrastructure changes

- Prefer construct-level updates in `cdk/lib/constructs/`.
- Keep stack entrypoints in `cdk/lib/*stack.ts` thin and compositional.
- Verify with `cd cdk && npm run build` and `cd cdk && npm test`.

### Frontend changes

- Keep page-level logic in hooks and composition roots.
- Avoid introducing large monolithic components.
- Verify with `cd frontend && npm run build` and `cd frontend && npm run lint` when possible.

### LLM/prompting changes

- Start in `cdk/text_generation/src/helpers/prompts.py` and `empathy.py`.
- Preserve evaluation contract and existing response shape unless requested.
- Cross-check `docs/promptModificationGuide.md` for expected workflow.

## Safe Command Set (Recommended)

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd cdk && npm run build`
- `cd cdk && npm test`

Use these commands to validate changes. If one cannot run in the current environment, report that explicitly.

## Change Checklist (Before Hand-off)

1. Scope: only required files changed.
2. Safety: no secret leakage; no deploy commands executed.
3. Compatibility: external behavior unchanged unless requested.
4. Verification: relevant checks run, or constraints clearly stated.
5. Documentation: update related docs for any changed workflow.

## Human-Escalation Triggers

Escalate and stop before proceeding when:

- a task requires production deployment
- a task requires unknown credentials or external secrets
- a change could impact protected data handling policy
- requirements are ambiguous and would affect architecture decisions

## Source of Truth Docs

- high-level project context: `CLAUDE.md`
- deployment process: `docs/deploymentGuide.md`
- troubleshooting: `docs/troubleshootingGuide.md`
- empathy scoring details: `docs/empathy-coach-deepdive.md`
- prompt change process: `docs/promptModificationGuide.md`
