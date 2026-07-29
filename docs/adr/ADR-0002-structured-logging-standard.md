# ADR-0002: Structured Logging Standard for Runtime Services

- Status: Accepted
- Date: 2026-07-29
- Decision owners: Backend + platform maintainers
- Related artifacts: cdk/lambda/**, cdk/socket-server/server.js, cdk/socket-server/novaOutputProcessor.js

## Context

Runtime paths currently rely heavily on unstructured `console.log`, `console.warn`, and `console.error` calls. This makes filtering noisy, correlation weak, and incident triage slower.

## Decision

Adopt structured JSON logging across Node.js Lambda and socket services with required fields:

- `level`, `message`, `timestamp`
- `requestId` where available
- `route` and `role` for API paths
- `sessionId` for chat/voice flows when present

Environment-based log levels will be used to limit high-volume debug output in production.

## Consequences

- Positive: faster querying and clearer operational diagnostics.
- Positive: reduced log parsing friction for alerts and dashboards.
- Risk: initial migration overhead and temporary mixed-format logs during transition.

## Alternatives considered

- Keep ad hoc console logging: rejected due to observability cost.
- Migrate to external logging platform first: rejected as unnecessary for initial standardization.

## Rollout plan

1. Introduce shared logging helper utilities.
2. Migrate high-volume socket-server logging first.
3. Migrate Lambda handlers incrementally by domain.
4. Add CI metric tracking for total raw console calls until migration completes.
