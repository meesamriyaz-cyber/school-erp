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
- Failed records are retained for platform-admin inspection and manual retry.

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
- During graceful shutdown, stop scheduling new polls, allow the active delivery cycle to finish, then disconnect MongoDB.
- On restart, pending events are picked up by polling; expired processing leases can be reclaimed.
- Validate shutdown and restart behaviour in the target hosting environment because process termination deadlines and signal delivery vary by platform.

## Release verification commands

```bash
pnpm --filter @school-erp/api test
pnpm --filter @school-erp/api exec vitest run src/tests/auditTransaction.integration.test.js src/tests/auditOutboxConcurrency.integration.test.js
```

Keep integration tests pointed at the dedicated test database. Never point them at production data.
