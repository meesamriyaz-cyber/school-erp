# Platform Operational Health

## Admin view

Platform administrators can inspect the API's current operational snapshot at:

```http
GET /api/v1/platform/operations
```

The endpoint is protected by the trusted-origin, authentication, and platform-admin role middleware. It reports the database connection state, aggregate readiness, and status for each critical background worker:

- `auditOutbox`: durable user-management audit delivery
- `notificationDelivery`: queued notification delivery
- `trialExpiry`: expiration of schools whose trial period has ended
- `pastDueGrace`: expiration and access suspension after the seven-calendar-day payment grace period

Each worker reports its lifecycle state, start time, last heartbeat, last completed cycle, last processed count, and the name of the last error type. Raw error messages, credentials, connection strings, and job payloads are not returned.

The platform administrator's System audit workspace displays this snapshot alongside audit delivery counts and failed-event summaries. Refresh the view after remediation to confirm recovery.

## Status meanings

- `starting`: worker started but has not completed its first polling cycle
- `running`: a polling cycle is in progress
- `healthy`: latest cycle completed without error and heartbeat is current
- `degraded`: latest cycle failed; inspect service logs and dependency health
- `stale`: heartbeat is older than 30 seconds; investigate process health, event-loop stalls, and database latency
- `stopped`: worker is not running in this API process

Aggregate readiness is healthy only when MongoDB is connected and every critical worker is started, has completed its initial cycle, and is neither degraded nor stale. A worker being actively running after a successful initial cycle does not by itself make readiness fail.

## Recovery procedure

1. Check the database connection state and API process health.
2. Inspect service logs using the worker name and the reported error type; never copy credentials or raw payloads into an incident ticket.
3. Correct the underlying dependency or deployment issue.
4. Refresh the System audit workspace and verify that each worker reports healthy with a recent heartbeat and cycle timestamp.
5. Verify `GET /api/v1/health/ready` returns HTTP 200.

Worker health is process-local. In a multi-replica deployment, this endpoint describes the API instance that handled the request; aggregate fleet monitoring should additionally inspect each replica through the deployment platform's health checks.
