# Empathetic Communication - Implementation Summary

## Overview

This document summarizes how the Empathetic Communication platform is implemented across AWS infrastructure, backend services, and the React frontend. It complements high-level architecture in `docs/architectureDeepDive.md` and operational guidance in `AGENTS.md`.

## Implementation Structure

### Infrastructure and control plane (`cdk/`)

- AWS CDK (TypeScript) composes network, database, API, auth, streaming, and hosting stacks.
- Key construct modules live in `cdk/lib/constructs/` and include API Gateway, Cognito auth, Lambda layers, business Lambdas, AppSync streaming, and monitoring.
- Runtime architecture-impacting changes must update `docs/architectureDeepDive.md` in the same PR.

### Backend services

- Node.js Lambda routes are split by role under `cdk/lambda/lib/instructor/` and `cdk/lambda/lib/student/`, with shared helpers in `cdk/lambda/lib/shared/`.
- Admin operations are handled by `cdk/lambda/adminFunction/`.
- Text generation and data ingestion workloads run as Python container Lambdas under `cdk/text_generation/` and `cdk/data_ingestion/`.
- Realtime voice and Socket.IO messaging run in `cdk/socket-server/` on ECS Fargate.

### Frontend (`frontend/`)

- React 18 + Vite application with role-specific pages under `frontend/src/pages/`.
- Student chat experience composes focused hooks for sessions, messages, empathy, and socket behavior.
- Authentication is managed through AWS Amplify and Cognito.

## Data and AI integration

- Primary relational data store: PostgreSQL on RDS (with pgvector for retrieval).
- Streaming and conversation support: AppSync + DynamoDB where required.
- LLM and embedding services: Amazon Bedrock integrations used by text and voice flows.

## Build and verification baseline

- Infrastructure checks: `cd cdk && npm run build` and `cd cdk && npm test`.
- Frontend checks: `cd frontend && npm run lint` and `cd frontend && npm run build`.
- Lambda bundle integrity test (`cdk/test/lambda-bundle-integrity.test.ts`) is mandatory to prevent deploy-time packaging regressions.

## Governance notes

- Cross-cutting architecture decisions are recorded in `docs/adr/`.
- Phase 0 tech-debt baseline metrics are tracked in `docs/tech-debt-scorecard.md`.
- Escaped production incidents are tracked in `docs/ops/incidents.json`.
