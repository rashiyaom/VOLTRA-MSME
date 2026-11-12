# Usage patterns

Open `/patterns` (Patterns in the navigation). This feature uses actual browser-recorded history. It does not backfill the older mixed telemetry log.

## User flow

- Personalize each circuit: label, equipment type, goal, optional operating schedule, activity threshold, and a daily active-time reminder. Setup is skippable.
- Activity and energy are available immediately after data is saved (normally within 15 seconds).
- Review hourly power, seven-day activity coverage, configured-rule observations, and recurring first-observed activity windows.
- Learned comparisons require five prior comparable days (weekday versus weekend), each with at least 12 recorded hours. Days may still be incomplete; the UI and assistant disclose that limit. This is an initial explainable baseline, not a trained classifier.
- “Expected” and “Review later” annotate observations. They do not retrain a model or suppress future reminders.
- Explore an example opens a separate, clearly labeled fictional 14-day dataset. It is never persisted into recorded history.

## Collection and limits

`usageHistory` receives samples from the existing telemetry store on every page, while the app is open. It integrates intervals no longer than 30 seconds into five-minute IndexedDB buckets and flushes every 15 seconds. Invalid, duplicate, stale, or disconnected intervals are excluded. Never interpret a gap as zero load. A Web Lock prevents duplicate collection by multiple tabs. Use one active monitoring tab per workspace.

Demo and hardware records, preferences, and feedback are separate. A circuit is active when its measured/estimated power exceeds the configured threshold, regardless of breaker state. Threshold changes affect future intervals. Measured channel power is preferred; otherwise power is estimated using voltage, current, and the panel power factor. Energy, runtime, schedule checks, and charts cover recorded intervals only. Midnight is based on the browser's local timezone. Keep a consistent timezone when comparing days.

Collection pauses when the browser closes; this release does not provide an always-on gateway recorder or background notifications. Use retention of 7, 30, or 90 days; older records are hidden immediately and pruned during the next write. Export a JSON summary or delete only the selected source's usage history. Browser-local history is not synchronized or isolated by account. Associate this browser workspace with one physical panel and clear hardware history before changing installations.

## Adaptive anomaly model

Incoming telemetry also feeds an explainable online model that learns active power, standby power, and completed-session duration independently for each circuit. Training is time-based rather than stream-rate based. The model excludes invalid data and breaks runtime continuity after gaps longer than 30 seconds. It observes only and cannot actuate a breaker. See [ADAPTIVE_MODEL.md](./ADAPTIVE_MODEL.md) for evidence gates, persistence behavior, and safety boundaries.

## Groq assistant

1. Open Settings → AI connection, paste a Groq API key, then choose **Verify & save key**. The key is stored in browser local storage and sent to the VOLTRA backend only for Groq requests.
2. A deployment can instead set `GROQ_API_KEY` in `src/backend/.env` as a server fallback.
3. Optionally set `GROQ_USAGE_MODEL` (default: `openai/gpt-oss-120b`).
4. Start the backend from `src/backend`: `python3 -m uvicorn main:app --port 8000`.
5. Set frontend `VITE_API_BASE` to the backend address (default: `http://localhost:8000`).

`GET /api/usage/status` reports configuration without exposing the key. `POST /api/usage/verify` validates a supplied key against Groq's model list, `POST /api/usage/chat` powers the evidence-grounded Patterns assistant, and `POST /api/usage/help` powers page-aware product help. Browser keys arrive in the dedicated `X-Voltra-Groq-Key` request header and are never written by the backend. The endpoints have timeouts, request limits, concurrency limits, and explicit upstream error states. There is no canned response pretending to be an LLM. Questions are sent only on user action. The assistants have no tools or access to device controls.

The existing application is a local workspace. Before exposing this metered endpoint publicly, put it behind authenticated access and a shared rate limiter; the included limits are per process and are not an authentication system. Restrict backend CORS for a public deployment. Do not place the Groq key in a frontend environment variable.

Provider reference: https://console.groq.com/docs/text-chat

## Validation

- Frontend: `npm test`, `npx tsc --noEmit`, `npm run build` from `src/frontend`.
- Backend: `python3 -m unittest discover -s src/backend/tests -p 'test_usage_router.py' -v` from repository root.
- Browser checks cover first-use setup, preferences after reload, explicitly labeled example history, data export, actual recording, source separation, Groq responses/error handling, dark mode, and mobile layout.
