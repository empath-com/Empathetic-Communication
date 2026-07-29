# ADR-0001: Shared Request Pipeline for Role Routers

- Status: Accepted
- Date: 2026-07-29
- Decision owners: Backend maintainers
- Related artifacts: cdk/lambda/lib/instructor/router.js, cdk/lambda/lib/student/router.js, cdk/lambda/lib/shared/runtime.js

## Context

Role router files currently duplicate request preparation and policy checks (user lookup, ownership guard checks, response envelope handling, and error mapping). This duplication increases drift risk and slows route updates.

## Decision

Adopt a shared request pipeline abstraction in `cdk/lambda/lib/shared/runtime.js` that provides:

- Cognito user-email lookup and propagation.
- Parameter ownership guard helpers.
- Standard response and error handling.
- Route dispatch with validated route metadata.

Role-specific router files keep only route-map wiring and role-specific policy declarations.

## Consequences

- Positive: lower duplication and fewer inconsistent auth/guard behaviors.
- Positive: easier to test route behavior through one pipeline path.
- Risk: migration mistakes could change status-code behavior if not verified.

## Alternatives considered

- Keep per-router logic and copy improvements manually: rejected due to drift risk.
- Full framework migration: rejected as over-scope for Phase 0.

## Rollout plan

1. Implement pipeline primitives behind existing public route signatures.
2. Migrate student and instructor routers first, then admin.
3. Validate with `cd cdk && npm test` including `lambda-bundle-integrity.test.ts`.
