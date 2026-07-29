# ADR-0003: API Contract Governance and Change Policy

- Status: Accepted
- Date: 2026-07-29
- Decision owners: Backend + frontend maintainers
- Related artifacts: cdk/OpenAPI_Swagger_Definition.yaml, cdk/lib/constructs/api-gateway.ts, docs/architectureDeepDive.md

## Context

The API surface is documented in OpenAPI and consumed across frontend, Lambda routes, and deployment constructs. Breaking or drifting contract changes are expensive and difficult to trace when governance is weak.

## Decision

Adopt contract governance with these rules:

- OpenAPI is the source of truth for REST route surface.
- Contract changes require migration notes in PR description and docs updates.
- Breaking changes require explicit deprecation windows and compatibility shims when feasible.
- CI validates documentation consistency and architecture-sync expectations for architecture-impacting changes.

## Consequences

- Positive: predictable API evolution and safer frontend/backend coordination.
- Positive: reduced accidental route contract drift.
- Risk: slightly higher PR discipline overhead.

## Alternatives considered

- Route-first changes without OpenAPI updates: rejected due to drift risk.
- Major versioning for every small change: rejected as high process overhead.

## Rollout plan

1. Keep OpenAPI updates in the same PR as route surface changes.
2. Add checks for docs consistency and architecture-impacting updates.
3. Track contract changes and migration notes in release documentation.
