# VOLTRA website audit report

**Audit date:** 15 October 2026

**Coverage:** frontend routes, responsive layouts, core interactions, Groq integration, API behavior, tests, and production build

## Result

The website passed the final automated route and interaction audits. All 11 public routes were checked at desktop and phone widths with no horizontal overflow, unlabeled buttons, console failures, or page-load failures.

The final implementation also removes several misleading placeholder behaviors. Authentication now uses the backend account API, the analytics page labels modeled scenarios clearly, and the AI assistants use the shared Groq configuration from Settings.

## Groq integration

Settings now includes a dedicated **AI connection** section where a user can paste, reveal, validate, save, replace, or remove a Groq API key.

- The browser stores the key locally under `voltra.groq.api-key`.
- Requests send the key to the VOLTRA backend in the `X-Voltra-Groq-Key` header.
- The backend uses the browser key for that request and falls back to `GROQ_API_KEY` when no browser key is supplied.
- Verification uses Groq's models endpoint before the key is saved.
- The key is excluded from CSV and JSON exports and is not persisted by the backend.
- Usage Patterns and the page-aware dashboard assistant both use the same configuration.
- The assistants receive bounded page and telemetry context, and their prompts prohibit invented readings and device-control claims.

The current browser-storage approach is suitable for a private device or local installation. A public, multi-user deployment should keep provider credentials in a server-side user secret store instead of browser storage.

## Feature validation

| Area | Result | Validation performed |
| --- | --- | --- |
| Dashboard | Pass | Route rendering, responsive layout, assistant availability |
| Live stream | Pass | Pause and resume behavior |
| Circuit controls | Pass | Demo circuit state change and overload simulation |
| Analytics | Pass | Tariff update, CSV download, scenario disclosure text |
| Usage Patterns | Pass | Example data, personalization state, embedded assistant |
| Monthly bill plan | Pass | Budget setup flow and phone drawer layout |
| Settings | Pass | Data-source switching, Groq verification flow, exports, responsive navigation |
| Field guide | Pass | Search and AI setup guidance |
| Authentication | Pass with environment limit | Client validation and mocked backend session behavior |
| Navigation | Pass | Desktop and mobile route navigation |
| Responsive layout | Pass | All 11 routes at desktop and 390 px phone width |

## UI and content improvements

- Settings uses a numbered, task-based information structure: data source, device connection, AI connection, and exports.
- The guide includes a clear AI setup chapter and explains cold-start behavior for new users.
- The phone Settings navigation is a visible two-column control rather than a clipped horizontal strip.
- The monthly-plan setup drawer stays below the mobile navigation and uses the remaining viewport height.
- The floating assistant is limited to pages where its context is useful and becomes a compact icon on phones.
- Authentication no longer displays a false database-connected status or creates mock JWTs in the browser.
- Analytics distinguishes live readings from modeled tariff, solar, and load-shift scenarios. It no longer describes a modeled report as a certified audit or claims that VOLTRA automatically schedules appliances.

## Automated checks

- Frontend unit tests: **34 passed across 6 files**
- Backend Groq route tests: **8 passed**
- TypeScript check: **passed**
- Production build: **passed**
- Focused ESLint on the new and modified Groq, assistant, settings, and authentication modules: **passed**
- Full route audit: **22 route/viewport combinations passed**
- Feature interaction audit: **10 scenarios passed**
- Groq settings interaction audit: **passed with intercepted requests and a non-secret test key**
- Git whitespace validation: **passed**

Route exports were cleaned up so analytics, guide, and live-stream code can split into their own production chunks. The production build still reports a large JavaScript entry chunk of about 783 KB and a CSS bundle of about 284 KB; further shared-dependency splitting is the main remaining frontend performance improvement.

## Environment-dependent checks

The following require infrastructure or credentials that were not used for this audit:

- A live Groq completion with the user's own API key. Request forwarding, validation, status behavior, and failure handling are covered by backend tests and the browser interaction audit.
- A real MongoDB account mutation and Google OAuth sign-in. The frontend now calls the existing backend routes, and session handling is unit-tested.
- Physical ESP32 USB, Bluetooth, Wi-Fi, Blynk, relay, and sensor behavior. Demo and browser interaction paths pass, but electrical hardware requires on-device testing.

Before a public deployment, restrict backend CORS to the deployed frontend origins, protect metered AI endpoints with user authentication and quotas, and move per-user provider credentials to encrypted server-side storage.
