# ClinicPulse Performance Dashboard

ClinicPulse is a production-oriented clinic performance dashboard built with Node.js, Express, MongoDB Atlas, Mongoose, EJS, Bootstrap 5, Vanilla JavaScript, Chart.js, and Axios. It synchronizes backend-only Hot Prospector data, calculates centralized reporting metrics, renders clinic and CSR dashboards, and exports operational reports to CSV and Excel.

## Features

- MongoDB-backed administrator authentication and sessions
- bcrypt password hashing and strong password policy
- Helmet security headers, CSRF protection, query/XSS sanitization, login/API rate limits, and safe errors
- Backend-only Hot Prospector tokens and credentials with retry, timeout, refresh, pagination, normalization, and idempotent upserts
- Timezone-aware clinic, CSR, campaign, group, and date filters
- Dashboard, clinic details, CSR performance, booking-ratio matrix, reports, settings, and sync logs
- Seven report types with preview, streaming CSV, and styled Excel exports
- Formula-injection-safe spreadsheet cells and audited exports
- MongoDB-backed cron/sync locking, structured redacted logs, health/readiness probes, and graceful shutdown
- Jest test suite and ESLint validation

## Project structure

```text
clinic-performance-dashboard/
├── config/
│   ├── db.js
│   ├── env.js
│   ├── hotProspector.js
│   └── reportDefinitions.js
├── controllers/
│   ├── authController.js
│   ├── dashboardController.js
│   ├── metricsController.js
│   ├── pageController.js
│   ├── reportController.js
│   ├── settingsController.js
│   └── systemController.js
├── docs/
│   ├── DEPLOYMENT.md
│   └── PRODUCTION_CHECKLIST.md
├── jobs/index.js
├── middleware/
│   ├── apiRateLimiter.js
│   ├── auth.js
│   ├── csrf.js
│   ├── errorHandler.js
│   ├── flash.js
│   ├── inputSanitizer.js
│   ├── locals.js
│   ├── loginRateLimiter.js
│   ├── metricsErrorHandler.js
│   ├── metricsValidation.js
│   ├── reportValidation.js
│   └── requestTimeout.js
├── models/
│   ├── Admin.js
│   ├── Appointment.js
│   ├── AuditLog.js
│   ├── Call.js
│   ├── Clinic.js
│   ├── CSR.js
│   ├── DailyAgentMetric.js
│   ├── DailyClinicMetric.js
│   ├── JobLock.js
│   ├── Lead.js
│   └── SyncLog.js
├── public/
│   ├── css/app.css
│   ├── js/
│   │   ├── api.js
│   │   ├── app.js
│   │   ├── booking-ratios.js
│   │   ├── charts.js
│   │   ├── clinic-details.js
│   │   ├── clinics.js
│   │   ├── csr-performance.js
│   │   ├── dashboard.js
│   │   ├── filters.js
│   │   ├── formatters.js
│   │   └── reports.js
│   └── favicon.svg
├── routes/
│   ├── authRoutes.js
│   ├── dashboardRoutes.js
│   ├── metricsRoutes.js
│   └── reportRoutes.js
├── scripts/
│   ├── migrateClinicLocations.js
│   ├── runJob.js
│   ├── seedAdmin.js
│   └── syncHotProspector.js
├── services/
│   ├── auditService.js
│   ├── authService.js
│   ├── dashboardViewService.js
│   ├── hotProspectorApiService.js
│   ├── hotProspectorAuthService.js
│   ├── hotProspectorClient.js
│   ├── hotProspectorNormalizer.js
│   ├── hotProspectorOverviewService.js
│   ├── hotProspectorSyncService.js
│   ├── jobLockService.js
│   ├── metricsFormulaService.js
│   ├── metricsService.js
│   ├── reportExportService.js
│   └── reportService.js
├── tests/
├── utils/
├── views/
├── .env.example
├── eslint.config.js
├── jest.config.js
├── render.yaml
├── package.json
└── server.js
```

## Requirements

- Node.js 20 or newer
- npm
- MongoDB Atlas or MongoDB 6+
- Hot Prospector API credentials

## Installation

```bash
npm install
```

Copy `.env.example` to `.env`, then replace every placeholder. Never commit `.env`.

```bash
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env`.

## Database and environment setup

Create an Atlas database user with `readWrite` access only to the application database. Add the application host to Atlas Network Access, place the Node.js connection string in `MONGODB_URI`, and use a separate database name in `TEST_MONGODB_URI`.

The application validates required variables, port values, session-secret length, metric ranges, and the production administrator password policy at startup. See [.env.example](./.env.example) for all variables.

Generate a session secret with a cryptographically secure password manager or Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Initial administrator

`ADMIN_PASSWORD` must contain 12–128 characters, uppercase, lowercase, a number, and a special character.

```bash
npm run seed:admin
```

The seed is idempotent. After production seeding, rotate the seed password according to the client's credential-management process. The current environment validation keeps this variable required.

## Run commands

```bash
npm run dev
npm start
npm test
npm run test:watch
npm run lint
```

`npm start` is the production command. Set `NODE_ENV=production` and terminate HTTPS at the hosting platform or reverse proxy.

## Reports and exports

Open `/reports` to preview or export:

1. Agency daily summary
2. Clinic monthly summary
3. CSR daily performance
4. Booking-ratio matrix
5. Speed-to-lead report
6. Call-efficiency report
7. Talk-time and gap-time report

Export endpoints:

- `GET /reports/export/csv`
- `GET /reports/export/xlsx`

Both accept `reportType`, `startDate`, `endDate`, `clinicId`, `csrId`, `campaignId`, and `groupId`. CSV output is streamed; Excel uses a streaming workbook writer. Exports contain the chosen filters and generation timestamp. Text beginning with spreadsheet formula characters is escaped.

## Security controls

- HTTP-only, SameSite=Lax, secure production session cookies stored in MongoDB
- Session regeneration after login and destruction after logout
- bcrypt hashing with 12 rounds and enforced password complexity
- Generic login failures and per-IP/email login throttling
- Global API throttling and request body/range limits
- Per-session CSRF tokens on state-changing requests
- Helmet CSP, HSTS in production, referrer policy, and secure headers
- MongoDB operator sanitization, Mongoose filter sanitization, escaped regex searches, and XSS-safe text inputs
- Safe EJS output escaping and no Hot Prospector secrets in browser code
- Production-safe error responses and structured logs with secret redaction
- Audit records for login, logout, failed login, clinic mappings, manual syncs, exports, and integration/settings actions

No CORS headers are enabled because the application is intentionally same-origin. Add an explicit allowlist only if a trusted external frontend is introduced.

## Reliability and operations

- `GET /health` is the liveness endpoint.
- `GET /ready` verifies MongoDB availability and shutdown state.
- SIGTERM/SIGINT stop cron jobs, drain HTTP connections, and disconnect MongoDB.
- Mongoose monitors disconnect, reconnect, and error events.
- Hot Prospector requests use timeouts, token renewal, exponential retry backoff, and redacted error logs.
- Unique external-ID indexes and upserts make synchronization idempotent; local records are never automatically deleted.
- MongoDB-backed locks prevent duplicate cron jobs and duplicate syncs across application instances.
- Structured JSON logs are written to stdout/stderr for hosting-provider collection and rotation.

## Scheduled jobs

In-process schedules are configured with `SYNC_CRON_*`. For external schedulers, disable in-process schedules and use the `job:*` npm scripts documented in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Implemented dashboard metrics

1. Agency new leads per day
2. Leads per month per clinic
3. Bookings per clinic per month
4. Lead-to-booking conversion
5. Conversation-to-booking conversion
6. Dials per day per CSR
7. Bookings per day per CSR
8. Total gap time
9. CSR booking ratio per clinic
10. Dials per unique lead
11. Average speed to lead
12. Median speed to lead
13. Leads contacted within one minute
14. Leads contacted within five minutes
15. Leads contacted within fifteen minutes
16. Average dials per lead per clinic
17. Answer rate
18. Conversation rate
19. Talk-time utilization
20. Average talk time per conversation

Default booking statuses are `booked`, `confirmed`, and `scheduled`; `cancelled`, `deleted`, and `no-show` are excluded. Both lists are configurable.

## Hot Prospector assumptions

- API response names vary by account, so normalizers accept known aliases and preserve every source record in `rawData`.
- External call, lead, appointment, and user IDs are assumed stable and unique account-wide.
- Call direction must normalize to `outbound` for dial, answer-rate, and speed-to-lead formulas.
- A conversation is based on the API conversation/transcript/disposition signals mapped by the normalizer.
- Speed to lead is the first outbound call on or after the lead creation timestamp.
- Appointment status, not appointment creation alone, determines a valid booking.
- Clinic date boundaries use the clinic's IANA timezone; precomputed daily metric dates are stored as UTC-midnight labels for the clinic-local day.
- The private Hot Prospector web overview can override agency overview totals only when `HOT_PROSPECTOR_WEB_COOKIE` is configured and valid.
- Unsupported lead or appointment methods can be changed centrally with `HOT_PROSPECTOR_METHOD_LEADS` and `HOT_PROSPECTOR_METHOD_APPOINTMENTS`.

## Fields to verify with the client account

- Exact call-log endpoint and whether `total_calls` means all calls or outbound dials
- Stable call ID, lead ID, appointment ID, and CSR/member ID field names
- Campaign and group identifiers assigned to each clinic
- Location-name spelling and the intended handling of “Unassigned / No Location”
- Call direction values and whether inbound calls appear in dashboard totals
- Answered-call statuses and whether transfers count as answered
- Conversation/decision-maker definition and relevant dispositions/tags
- Booking definition, valid appointment statuses, cancellation/no-show semantics, and whether appointment date or booking-created date drives reports
- Lead-created timestamp, call timestamp, and timezone/offset behavior
- Duration versus talk-time fields and units
- Working-time and gap-time source/definitions
- Pagination keys, page numbering, date formats, and endpoint maximum ranges
- Token expiry/refresh response fields
- Whether the web-dashboard cookie is permitted and how it will be rotated

## Certified v2 data pipeline

The legacy dataset remains the default until the v2 quality gates pass. V2 never writes to the legacy lead, call, appointment, or daily-metric collections.

1. Open `/settings/clinics`. For every visible clinic, enter exact Hot Prospector location aliases, confirm the campaign/group identifiers, select the clinic's IANA timezone, and mark both mapping and timezone as verified.
2. Export representative Hot Prospector network traffic as a sanitized HAR. Remove cookies, authorization headers, tokens, phone numbers, emails, names, recordings, and transcripts. HAR files are ignored by Git.
3. Import the contract capture:

   ```bash
   npm run v2:import-har -- C:\secure\sanitized-hot-prospector.har
   ```

4. Configure `METRICS_V2_BACKFILL_START_DATE` to the earliest source date and run the resumable backfill:

   ```bash
   npm run v2:backfill -- 2025-01-01 2026-07-20
   ```

5. Open `/settings/data-quality`, inspect pagination, endpoint, mapping, timestamp, and metric mismatches, then run reconciliation. Unsupported values display `N/A`; they are never silently converted to zero.
6. Enable `METRICS_V2_PIPELINE_ENABLED=true` while keeping `METRICS_DATA_VERSION=v1`. This refreshes v2 every five minutes without changing production reads.
7. Complete and record a rollback rehearsal, set `METRICS_V2_ROLLBACK_VERIFIED=true`, and resolve every critical issue. Only then set `METRICS_DATA_VERSION=v2`.

Startup blocks a v2 cutover unless all visible clinics are verified, the complete configured history is backfilled, the latest reconciliation for every processed day is certified, source data is fresh, no critical issue remains, and rollback is verified. Reverting `METRICS_DATA_VERSION=v1` is the rollback.

All metrics API responses include `source`, `sourceAsOf`, `freshnessSeconds`, `certification`, and `qualityIssues`. A certification applies only to the exact source snapshot and filters used by reconciliation.

## Deployment and release

Use [render.yaml](./render.yaml) for a Render web service. Full Atlas, cron, backup, restore, and monitoring instructions are in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). Complete [docs/PRODUCTION_CHECKLIST.md](./docs/PRODUCTION_CHECKLIST.md) before launch.
