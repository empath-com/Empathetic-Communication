# Idle Modes

This document describes the two cost-optimization operating modes currently used by this project.

## 1) Default mode (standard deployment)

In default mode, the platform remains fully available, but the socket/voice runtime is scheduled to scale down during off-hours.

Behavior:
- API Gateway, Lambda APIs, Cognito, and the database remain available.
- The ECS Socket.IO service scales to zero nightly.
- The ECS Socket.IO service scales back up on weekday mornings.

Current schedule in `cdk/lib/ecs-socket-stack.ts`:
- Nightly scale-down: 06:00 UTC (10 PM PST / 11 PM PDT), every day.
- Weekday scale-up: 15:00 UTC (7 AM PST / 8 AM PDT), Monday to Friday.

## 2) Global idle mode (`idleMode=true`)

Global idle mode is enabled with CDK context:

```bash
npx cdk deploy --all --context idleMode=true
```

Context parsing is implemented in `cdk/bin/cdk.ts`.

In this mode, additional cost-saving changes are applied across stacks.

### API stack changes

From `cdk/lib/api-service-stack.ts`:
- WAF creation is skipped to remove fixed WebACL cost.

### Database stack changes

From `cdk/lib/database-stack.ts`:
- Backup retention is reduced from 7 days to 1 day.
- CloudWatch log retention is reduced from infinite to 1 week.
- Enhanced RDS monitoring is disabled.
- RDS Proxy is not created (to avoid hourly proxy cost).
- A nightly Lambda stops the RDS instance at 06:30 UTC.
- There is no automatic start action in code; start is manual when needed.
- AWS may automatically restart a stopped RDS instance after 7 days.

### Socket stack changes

From `cdk/lib/ecs-socket-stack.ts`:
- ECS desired count starts at 0.
- Auto-scaling max capacity is capped at 0.
- Weekday morning scale-up is disabled.
- Nightly scale-down remains in place (idempotent with capacity 0).

## Operational caveats

- In global idle mode, voice/socket features remain unavailable until capacity is increased from zero.
- In global idle mode, database-dependent workloads may fail until the RDS instance is manually started.
- Any environment using custom WSS (`wss://`) still depends on external DNS and TLS termination outside this repository.

## Quick comparison

| Capability | Default mode | Global idle mode |
| --- | --- | --- |
| REST API (API Gateway + Lambda) | Available | Available |
| WAF | Enabled | Disabled |
| Socket service (ECS) | Scheduled business-hours availability | Kept at zero capacity |
| RDS Proxy | Enabled | Disabled |
| RDS compute | Always on | Stopped nightly (manual restart) |
| RDS backup retention | 7 days | 1 day |
