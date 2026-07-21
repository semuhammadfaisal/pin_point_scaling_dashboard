# Production deployment

## Render deployment

1. Create a MongoDB Atlas production cluster, database user, and `clinic_dashboard` database.
2. Restrict Atlas Network Access to Render outbound IP ranges when the selected Render plan provides them. If temporary `0.0.0.0/0` access is unavoidable, use a unique strong database password and least-privilege database user.
3. Push the repository to a private Git provider and create a Render Blueprint from `render.yaml`.
4. Set every secret marked `sync: false` in Render. Add the remaining values from `.env.example` as needed.
5. Deploy, then verify `GET /health` returns `200` and `GET /ready` returns `200` after MongoDB connects.
6. Open a one-off Render shell and run `npm run seed:admin` exactly once. The command is idempotent.
7. Sign in, create clinic mappings, test the Hot Prospector connection, run a manual seven-day sync, and reconcile results against the client account.

The application listens on `PORT`, trusts one production proxy hop, uses HTTPS-only session cookies, and stores sessions in MongoDB.

## Environment checklist

Required secrets: `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `HOT_PROSPECTOR_API_UID`, and `HOT_PROSPECTOR_API_KEY`. `SESSION_SECRET` must be random and at least 32 characters. The administrator password must be 12–128 characters with uppercase, lowercase, number, and special characters.

`HOT_PROSPECTOR_WEB_COOKIE` is optional. It is required only when the client wants dashboard totals sourced from Hot Prospector's private web-dashboard endpoint. It expires and must be treated like a password.

## Cron strategy

The supplied Render service runs the in-process schedules and should initially use one web instance. MongoDB-backed locks stop duplicate jobs across processes and overlapping sync attempts.

For independent scaling, set `SYNC_CRON_ENABLED=false` on every web instance and configure an external scheduler to run:

| Schedule | Command |
| --- | --- |
| Every 5 minutes | `npm run job:recent` |
| Every hour | `npm run job:metrics` |
| Nightly | `npm run job:nightly` |
| Nightly after sync | `npm run job:recalculate` |
| Nightly after recalculation | `npm run job:precompute` |

Never run both strategies simultaneously unless deliberately testing the lock behavior.

## V2 accuracy rollout

Deploy v2 in shadow mode first:

```text
METRICS_DATA_VERSION=v1
METRICS_V2_PIPELINE_ENABLED=true
METRICS_V2_BACKFILL_START_DATE=YYYY-MM-DD
METRICS_V2_ROLLBACK_VERIFIED=false
```

Import only sanitized HAR captures, verify every clinic mapping/timezone, run `npm run v2:backfill`, and use `/settings/data-quality` until all checkpoints and reconciliations pass. Do not set `METRICS_DATA_VERSION=v2` merely because a sync completed. Startup deliberately fails the v2 cutover when history, freshness, mappings, reconciliation, critical issues, or rollback verification are incomplete.

After a successful rollback rehearsal, set `METRICS_V2_ROLLBACK_VERIFIED=true` and then `METRICS_DATA_VERSION=v2`. Roll back by restoring `METRICS_DATA_VERSION=v1`; the parallel collections keep both datasets intact.

## MongoDB Atlas configuration

- Use a dedicated production project and an `atlasAdmin` account only for setup.
- Give the application user `readWrite` access only to the application database.
- Enable Atlas automated backups and point-in-time recovery where the cluster tier supports it.
- Configure backup retention to meet the client's contractual and regulatory requirements.
- Add alerts for connection saturation, storage, replication lag, and backup failures.
- Test restore quarterly into a separate database or cluster. Never overwrite production during a restore drill.

## Backup and restore

Use Atlas continuous cloud backups as the primary mechanism. Before major migrations, create an on-demand snapshot. For a restore, stop cron jobs and writes, restore to a new cluster/database, validate collection counts and indexes, update `MONGODB_URI`, deploy, verify `/ready`, perform metric reconciliation, and only then resume jobs.

## Monitoring

Logs are structured JSON on stdout/stderr for Render/Railway log collection. Alert on `server_start_failed`, `mongodb_error`, `cron_failed`, `hot_prospector_api_error`, `request_failed`, readiness failures, repeated failed logins, and sync logs with `failed` or `partial` status.
