# Audit Outbox Operations

## Purpose

User-management audit events are first written to `AuditOutbox`. For mutations using `withAuditTransaction`, the user change and outbox enqueue commit or roll back together. The background worker delivers committed events to `AuditLog`.

## Worker behaviour

- Poll interval: 5 seconds.
- Batch size: 25 by default; manual retry requests one event.
- Maximum automatic attempts: 10.
- Retry delay: exponential backoff starting at 1 second, capped at 1 hour.
- Processing lease: 5 minutes. A processing event older than this can be reclaimed.
- Each claim receives a unique processing token. A worker can acknowledge or reschedule an event only while it still owns that token.
- `eventId` provides idempotency when a worker inserts an audit log but crashes before acknowledging the outbox record.
- Failed records are retained for platform-admin inspection and manual retry. Manual retry clears any stale processing lease/token before returning the event to pending.

## Monitoring

Use the platform-admin endpoint:

```http
GET /api/v1/platform/audit-outbox
```

It reports counts for `pending`, `processing`, `staleProcessing`, `delivered`, and `failed`, plus up to 50 recent failed-event summaries. Event payloads are intentionally excluded.

Investigate:

1. A growing `pending` count: check MongoDB connectivity, worker startup, and whether retries are being scheduled.
2. Any `staleProcessing` count: check for process crashes, long pauses, or database/network stalls. The monitoring threshold is aligned to the five-minute worker lease.
3. A growing `failed` count: inspect `lastError`, attempts, timestamps, and database health.
4. A high delivered-to-pending backlog: check whether the worker is running on every active API deployment and whether MongoDB can sustain the workload.

## Manual retry

Platform administrators can retry one event that is currently `failed`:

```http
POST /api/v1/platform/audit-outbox/:outboxId/retry
```

The endpoint resets the automatic attempt counter, records the administrator and retry timestamp, moves the event to `pending`, and requests an immediate single-event processing pass. If another worker is already running in the same process, normal polling will pick up the pending event. The response reports the event state observed after the processing request; check the monitoring endpoint again to confirm final delivery.

Do not repeatedly retry an event without investigating its `lastError`. Manual retry is intended after the underlying cause has been corrected.

## Deployment and shutdown checks

- Configure `MONGO_TEST_URI` only for a dedicated test database whose name includes `test`; run the transaction and concurrency integration tests before release.
- MongoDB must be a replica set or sharded cluster for transactional user mutation plus outbox enqueue.
- Start the worker only after the database connection is established.
- During graceful shutdown, stop accepting new HTTP requests and wait for in-flight handlers to finish; then stop scheduling worker polls, allow the active delivery cycle to finish, and disconnect MongoDB.
- On restart, pending events are picked up by polling; expired processing leases can be reclaimed.
- Validate shutdown and restart behaviour in the target hosting environment because process termination deadlines and signal delivery vary by platform.

## Release verification commands

```bash
pnpm --filter @school-erp/api test
pnpm --filter @school-erp/api exec vitest run src/tests/auditTransaction.integration.test.js src/tests/auditOutboxConcurrency.integration.test.js
```

Keep integration tests pointed at the dedicated test database. Never point them at production data.


## Integrity and security boundaries

- Audit event construction is allowlisted in the service; request bodies and credential fields must never be passed as event payloads.
- Audit-log read and outbox-operation routes are restricted to platform administrators, while school audit-log reads are restricted to the authenticated school administrator and target school.
- Mongoose middleware rejects supported document mutation paths, including query updates/deletes and model-level bulk writes. This is application-level protection, not a database-level immutable-storage guarantee: direct MongoDB collection writes or privileged database credentials can bypass Mongoose middleware.
- For stronger tamper resistance, restrict production database credentials to the minimum required collections and operations, monitor privileged database access, and consider exporting audit records to a separately controlled append-only/WORM destination according to the organisation's retention requirements.
- Never expose the outbox event payload through operational endpoints; inspect only the approved metadata fields.
