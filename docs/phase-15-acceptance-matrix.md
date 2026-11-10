# Phase 15 Production Readiness Acceptance Matrix

## Automated repository evidence

The CI workflow `.github/workflows/tests.yml` currently runs:

- Backend tests and MongoDB integration tests against a dedicated MongoDB 7 replica set and `school-erp-test`.
- Frontend lint.
- Frontend Vitest tests.
- Frontend production build.

Existing backend integration suites include academic structure/placement, attendance notifications, certificates/reports, classes/sections, dashboard, enrollments, fees, messaging, staff, platform school creation, and audit transactions/concurrency. Unit/route tests cover authentication, role authorization, active tenant checks, portal access, model validation, notification/audit workers, and readiness.

The repository has API-level integration tests. It does not currently include a configured browser automation framework or a complete browser-driven acceptance suite.

## Phase 15 acceptance matrix

| Workstream | Repository evidence | External evidence still required |
|---|---|---|
| 15.1 Cross-module integration | Backend integration suite and frontend tests/build | Staging workflow run using representative school accounts/data |
| 15.2 Role/permission audit | Authentication, role middleware and route tests | Manual role matrix against deployed environment |
| 15.3 Tenant isolation | Cross-tenant integration tests and authenticated tenant derivation | Staging negative tests using two separate schools |
| 15.4 Historical integrity | Enrollment transfer audit, exam curriculum snapshots, marks audit and model constraints | Reconcile imported/legacy production records |
| 15.5 Database performance | Compound tenant-scoped indexes and index contract tests | Explain execution plans, realistic load, latency and database resource measurements |
| 15.6 Backup/recovery | Backup/recovery runbook | Configured production backups, retention/alerts, isolated restore drill and measured RPO/RTO |
| 15.7 Observability | Liveness/readiness endpoints and worker heartbeat health | Provider monitoring, alert routing, log retention and incident drill |
| 15.8 Deployment/rollback | CI build/test pipeline and deployment/rollback runbook | Actual staging deployment, graceful shutdown, rollback and measured recovery |
| 15.9 End-to-end acceptance | API integration tests and frontend component tests | Browser-based acceptance across roles and real hosting/database topology |

## Release blockers

Do not mark Phase 15 production-ready until the service owner has supplied evidence for:

1. Production database backup/PITR, retention, monitoring and a successful isolated restore drill.
2. Approved RPO/RTO and named recovery operators.
3. Staging deployment and rollback exercise using the actual hosting provider.
4. Hosting termination grace period validated against API shutdown behaviour.
5. Per-replica health and background-worker monitoring/alerting.
6. Representative browser acceptance for platform admin, school admin, principal, teacher, student and parent roles.
7. Two-school negative testing proving tenant isolation after deployment.
8. Database query plans and load measurements at an agreed realistic data volume.

A successful CI run proves the repository's automated checks passed in the CI environment. It does not prove production infrastructure, backups, restoration, external integrations, real-world performance, or deployment rollback.
