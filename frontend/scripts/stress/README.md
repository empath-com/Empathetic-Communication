# Stress Test Scripts

These scripts run from `frontend/` and target staging endpoints for load testing.

## What This Covers

- Text mode load against `student/create_session`, `student/create_message`, and `student/text_generation`
- Voice mode backend/socket load against the Socket.IO voice service
- Report output in `frontend/stress-reports/` as JSON + CSV + throughput chart markdown
- Local backend job endpoint to launch jobs from the admin UI

## Auth Input

Provide either:

1. A single student token via env vars:
   - `STRESS_ID_TOKEN`
   - optional `STRESS_USER_EMAIL` (used if email claim is missing)

2. A tokens file with multiple credentials:
   - `STRESS_TOKENS_FILE=./scripts/stress/tokens.example.json`

### Token File Format

```json
[
  {
    "email": "student1@example.com",
    "token": "<id-token>"
  },
  {
    "email": "student2@example.com",
    "token": "<id-token>"
  }
]
```

## Token Bootstrap Script

You can generate `tokens.generated.json` directly from Cognito via AWS CLI.

Required env vars:

- `STRESS_AWS_REGION`
- `STRESS_COGNITO_CLIENT_ID`

Choose one user input mode:

1. `STRESS_USERS_FILE` containing:

```json
[
  { "username": "student1", "password": "Passw0rd!", "email": "student1@example.com" },
  { "username": "student2", "password": "Passw0rd!", "email": "student2@example.com" }
]
```

2. Generated users:
- `STRESS_USER_COUNT`
- `STRESS_USER_PREFIX`
- `STRESS_USER_PASSWORD`
- optional `STRESS_USER_DOMAIN`

Optional env vars:

- `STRESS_AWS_PROFILE`
- `STRESS_COGNITO_CLIENT_SECRET` (if app client uses secret)
- `STRESS_AUTH_FLOW` default `USER_PASSWORD_AUTH`
- `STRESS_TOKENS_OUTPUT` default `./scripts/stress/tokens.generated.json`

Run:

```bash
npm run stress:tokens
```

## Text Mode Run

Required env vars:

- `STRESS_API_ENDPOINT` (example: `https://api.staging.example.com/`)
- `STRESS_SIMULATION_GROUP_ID`
- `STRESS_PATIENT_ID`

Optional env vars:

- `STRESS_USERS` default `50`
- `STRESS_MESSAGES_PER_USER` default `3`
- `STRESS_RAMP_MS` default `150`
- `STRESS_TEXT_STREAM` default `false`
- `STRESS_REQUEST_TIMEOUT_MS` default `90000`

Run:

```bash
npm run stress:text
```

## Voice Mode Run

Required env vars:

- `STRESS_SOCKET_URL` (example: `wss://ws.staging.example.com`)

Optional env vars:

- `STRESS_USERS` default `50`
- `STRESS_VOICE_TURNS` default `2`
- `STRESS_RAMP_MS` default `200`
- `STRESS_VOICE_READY_TIMEOUT_MS` default `30000`
- `STRESS_VOICE_RESPONSE_TIMEOUT_MS` default `30000`
- `STRESS_VOICE_TURN_GAP_MS` default `800`
- `STRESS_VOICE_INPUT_MODE` default `text` (`text` or `end-audio`)
- `STRESS_VOICE_ID` default `matthew`
- `STRESS_PATIENT_ID`, `STRESS_PATIENT_NAME`, `STRESS_PATIENT_PROMPT`

Run:

```bash
npm run stress:voice
```

## Admin Launcher + Backend Job Endpoint

The admin page launches stress tests through a local backend endpoint.

1. Start the endpoint:

```bash
npm run stress:job-server
```

2. Open Admin -> Stress Testing in the frontend and set:
- Job endpoint (default `http://127.0.0.1:8787`)
- API/socket/group/patient values

3. Start text or voice job from the page and monitor live status.

The job endpoint supports:

- `GET /health`
- `POST /jobs`
- `GET /jobs`
- `GET /jobs/:id`

## Notes

- A single token can drive 50 concurrent virtual users for concurrency testing.
- For realistic per-user auth load, use `STRESS_TOKENS_FILE` with multiple student tokens.
- Use a dedicated simulation group and patient in staging to avoid polluting instructor analytics.
- Each run emits `*-latency.csv`, `*-throughput.csv`, and `*-throughput.md` for quick analysis and charting.
