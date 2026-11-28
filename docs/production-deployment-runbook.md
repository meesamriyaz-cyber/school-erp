# Production Deployment and Rollback Runbook

## Scope and deployment model

This repository contains a React/Vite web application and a Node.js/Express API backed by MongoDB. The repository CI workflow validates frontend lint/tests/build and backend tests against a disposable MongoDB replica set.

No hosting provider, production deployment target, infrastructure-as-code configuration, deployment workflow, or automated rollback mechanism is defined in this repository. This runbook is provider-neutral. The service owner must adapt each provider-specific step and record the actual service names, domains, regions, secret locations, and operator permissions before production release.

Do not treat this document or a passing CI run as evidence that a production deployment or rollback has been exercised.

## Release prerequisites

Before a production release, confirm all of the following:

- A reviewed commit SHA is selected from the intended release branch.
- CI is green for that exact SHA: backend tests, frontend lint, frontend tests, and frontend production build.
- The API runtime uses `NODE_ENV=production`, `MONGO_URI`, strong distinct JWT secrets, and an HTTPS `WEB_URL`.
- The frontend is built with `VITE_API_BASE_URL` set to the actual HTTPS API base URL, including the `/api/v1` path. This is a Vite build-time variable embedded in the static bundle; setting it only as a runtime hosting variable after the bundle is built does not change the API destination.
- Never promote the CI build artifact that uses the reserved `api.school-erp-ci.invalid` sentinel. Build a separate production artifact with the real API origin and verify its compiled configuration before publication.
- `MONGO_DEV_URI` and `MONGO_TEST_URI` are not configured as production fallbacks. Production must not silently fall back to either.
- Production secrets are stored in the hosting provider's secret manager, not in repository files, build arguments, logs, or deployment artifacts.
- The production MongoDB cluster supports transactions and has the approved backup/PITR controls described in [backup-recovery-runbook.md](./backup-recovery-runbook.md).
- The service owner has approved RPO, RTO, maintenance window, rollback owner, and customer communication plan.
- A tested pre-release backup or provider snapshot is available.
- Any schema/index changes have a forward-compatible migration and rollback/compatibility assessment.
- External object/file storage, if used, has a separate recovery plan.

## Deployment sequence

1. Announce the maintenance/release window and identify the release operator and rollback decision-maker.
2. Confirm the target environment and production secret names without printing secret values.
3. Confirm the database backup status and record the backup/snapshot identifier.
4. Run the exact release commit through CI and retain the workflow URL.
5. Build the frontend from the same commit and publish the generated static assets using the provider's supported deployment mechanism.
6. Deploy the API from the same commit. Configure production environment variables through the provider's secret manager.
7. Start the API and verify that it connects to MongoDB before serving traffic. The server starts the audit outbox and notification delivery workers after the database connection succeeds.
8. Verify `GET /api/v1/health` returns HTTP 200.
9. Verify `GET /api/v1/health/ready` returns HTTP 200 and reports a connected database and healthy audit/notification workers. A 503 is a release failure; do not route user traffic to an unready instance.
10. Verify the configured frontend origin is accepted and an untrusted origin is rejected.
11. Execute the smoke/acceptance checklist below with a non-privileged test account and approved test records.
12. Monitor application errors, MongoDB metrics, worker health, notification/audit backlogs, and user-facing workflows through the agreed observation window.
13. Record the deployed commit, artifact identifiers, operator, start/end time, smoke-test evidence, and release decision.

## Smoke and acceptance checks

- Public liveness endpoint responds without exposing configuration or credentials.
- Readiness endpoint is healthy; both workers have completed an initial cycle and their heartbeats are fresh.
- Login, refresh/session validation, logout, and revoked-session rejection work.
- School administrator access is restricted to the authenticated active tenant.
- A school user cannot read or mutate another tenant's records by substituting IDs or request-body tenant IDs.
- Role restrictions are enforced for platform administrator, school administrator, principal, teacher, student, and parent workflows.
- Student, guardian, academic year, class/section, enrollment, attendance, examination/marks/results, fees, homework, notifications, messaging, and reports load for authorized roles.
- Unpublished examination results remain unavailable to student/parent portal accounts.
- Audit events and notification delivery progress; no sensitive payloads or secrets appear in operational responses/logs.
- Frontend routes load and the compiled bundle uses the intended production API origin (not localhost or the CI sentinel).
- Error responses do not disclose stack traces, database URIs, credentials, or internal implementation details.

Use synthetic or approved test accounts. Do not create or modify real student/financial records merely to perform a smoke test.

## Rollback decision and procedure

Trigger rollback when the release causes a material authentication/authorization regression, cross-tenant exposure, persistent 5xx errors, failed readiness, corrupted critical workflows, unacceptable data integrity issues, or database/worker instability.

1. The incident owner declares rollback and records the reason/time.
2. Stop or drain traffic to the unhealthy release using the hosting provider's supported traffic controls.
3. Redeploy the last known-good API and frontend artifacts from their recorded commit/build identifiers. Do not rebuild from a moving branch during an incident.
4. Keep the database at its current state unless the incident commander explicitly approves a data-recovery action. Application rollback is not the same as database restore.
5. If a schema change is incompatible with the previous application version, follow its pre-approved compatibility/migration plan. Do not improvise destructive reverse migrations.
6. Verify liveness, readiness, authentication, tenant isolation, critical workflows, and worker delivery after rollback.
7. Monitor and preserve logs/metrics; record the recovery time and any queued work requiring replay.
8. If data loss or corruption occurred, use the separate backup/recovery runbook and restore to an isolated cluster first. Never restore over the only surviving production copy.

## Graceful shutdown and scaling

The API connects to MongoDB before starting workers. On SIGINT/SIGTERM it stops accepting new HTTP requests, waits for in-flight requests, stops both workers, and disconnects MongoDB. Confirm the hosting provider sends a supported termination signal and allows enough shutdown grace time for the longest in-flight request and active worker cycle. Validate this in staging; do not assume a provider's default deadline is sufficient.

Each API process starts its own audit and notification workers. When scaling to multiple API replicas, verify that the existing atomic claim/lease/idempotency mechanisms prevent duplicate processing and that aggregate polling load is acceptable. Monitor worker health and queue age across every replica. If the hosting platform cannot expose per-replica readiness, configure health checks so an unhealthy replica is not routed traffic.

## Evidence required before declaring deployment readiness

Retain in the approved operations system:

- Hosting provider/service identifiers and deployment configuration owner.
- Exact release commit and frontend artifact identifier.
- CI workflow URL and results.
- Redacted environment-variable inventory (names only; never values).
- Backup identifier and backup-success evidence.
- Liveness/readiness and smoke-test timestamps/results.
- Graceful shutdown/restart exercise results.
- Rollback exercise results, including previous artifact/commit and measured recovery time.
- Known limitations, owner, and remediation date.

Production deployment and rollback remain unverified until a staging or production-like exercise has actually been performed and evidence recorded.
