# Phase 16 — School ERP System-Wide Audit & Release Readiness

**Audit baseline:** `feature/platform-school-directory` at `627a528390b3f7cc7194a83194599d2f634bc15a`  
**Scope:** repository implementation, API authorization, tenant and assignment scoping, frontend role workflows, automated test/CI coverage, and documented production operations.  
**Status:** audit in progress; release is not approved.

This is a read-only audit record. No application code or permissions were changed as part of the initial review. Findings must be remediated with regression tests before release.

## 1. Executive summary

The Core School ERP is feature-complete for the implemented web workflows and has a substantial automated backend integration and frontend component-test suite. The user reported **784 local tests passed**. The latest Phase 15 GitHub Actions run (`42792827168`) completed successfully for both backend/MongoDB integration and frontend lint/tests/build.

The system is **not yet release-ready**. The audit found a high-priority teacher-to-guardian privacy exposure, role provisioning/workspace mismatches, a production frontend API-origin configuration hazard, and incomplete operational evidence. These findings do not negate the successful test run; they identify areas the current suite does not adequately protect.

## 2. Remediation progress

The following code-level findings have been addressed on the audit branch:

| Finding | Remediation | Verification |
|---|---|---|
| Teacher access to school-wide guardian records | Removed teacher access to global guardian list/detail; student-scoped guardian reads now require an active teaching assignment | Regression tests cover global denial, assigned-student allow and unassigned-student denial |
| Guardian directory unbounded response | Added server-side page/limit/search/status validation, stable sorting, response projection and bounded offsets; web UI now uses server pagination | API and web tests cover filters, pagination and invalid query inputs |
| Unsupported roles provisionable | New creation/role assignment of accountant, librarian and transport manager is blocked; legacy roles remain filterable for cleanup | Backend role validation tests |
| Principal user-management navigation | User Management is hidden and route-guarded for principals; unfinished Settings navigation removed | App role-navigation test |
| Portal partial failures | Student/parent portal now identifies failed sections and provides a retry action | Partial-failure/retry component test |
| Production frontend API origin | Production Vite build now requires an HTTPS `VITE_API_BASE_URL` ending in `/api/v1`; CI uses a reserved non-deployable sentinel; example and deployment runbook updated | Frontend lint/build passed with the CI sentinel |

**CI evidence:** run `42813380931` passed backend/MongoDB integration and frontend lint/tests/build on `16af2cd`. Follow-on commits normalize trailing slashes in the API client and remove an unnecessary field from the guardian list projection; the latest branch-head run must also pass before the remediation batch is declared verified.

Existing users already assigned unsupported roles still require a school-by-school review and reassignment or suspension before launch; blocking new assignments does not automatically migrate legacy accounts.

## 2. Verified strengths

- Authentication re-reads the user record and current role/tenant from the database, checks active account and active school state, and uses access-token versioning.
- Web refresh tokens are held in an HTTP-only cookie; native-client refresh tokens use a separate request flow. Session rotation and revocation are implemented.
- The active tenant is derived from the authenticated account. School data queries generally include the authenticated tenant rather than trusting a request-supplied tenant ID.
- Teacher assignment scoping is implemented in important workflows, including student records, enrollments, attendance, timetable, examinations/marks, homework, reports, announcements and parent-teacher messaging.
- Student and parent portal data is derived from the authenticated student or active guardian-to-student links, including portal-access relationship rules.
- Academic-year, enrollment-transfer, guardian-primary, examination snapshot/mark-audit, fee-payment reversal and audit-outbox workflows have transaction and integrity controls.
- Schema index contracts are tested for important high-use collections. These tests verify declared Mongoose schema indexes; they do not prove that production MongoDB has built those indexes or that real query plans meet performance targets.
- Readiness checks include MongoDB connectivity and background-worker health, including stale-heartbeat detection.
- Backup/recovery and deployment/rollback runbooks explicitly state that documentation is not evidence of a completed production drill.

## 3. Findings requiring remediation or release decisions

### P1 — Teacher access exposes school-wide guardian contact data

**Status: remediated in code; latest branch-head CI verification pending.**

**Affected code**
- `services/api/src/routes/guardianRoutes.js`
- `services/api/src/controllers/guardianController.js`
- `services/api/src/routes/studentGuardianRoutes.js`
- `services/api/src/controllers/studentGuardianController.js`
- `services/api/src/tests/guardianRoutes.test.js`

**Evidence**
- `GET /guardians` permits `teacher`; `listGuardians` returns every guardian in the authenticated tenant, including phone and email.
- `GET /guardians/:guardianId` permits `teacher`; `getGuardian` returns the guardian record and all linked students and relationship flags.
- `GET /students/:studentId/guardians` permits `teacher`; its controller verifies only that the student belongs to the tenant. It does not verify that the teacher has an active assignment to that student.
- Existing tests explicitly assert that teachers can list guardians and view guardian contact information for a student without establishing a teaching assignment.

**Risk:** tenant isolation is present, but assignment-level authorization and data minimization are missing. A teacher can access family contact details and linked-student relationships outside their teaching responsibilities.

**Required remediation**
1. Remove teacher access to the unfiltered school-wide guardian list and guardian-wide detail endpoint.
2. Decide whether teachers need guardian contact details for students they teach. If yes, retain only a student-scoped read and require an active teaching assignment for that student.
3. Return only the minimum guardian and relationship fields needed for that assigned student.
4. Replace the existing permissive tests with denial tests for school-wide listing, guardian-wide detail, and unassigned students; add a positive test for an assigned student if that access remains a product requirement.

**Release gate:** must be resolved before real student/family data is loaded.

### P1 — Production web build can silently target localhost

**Status: production build guard and CI configuration implemented; actual production artifact verification remains an external release gate.**

**Affected code**
- `apps/web/src/lib/api.js`
- `apps/web/vite.config.js`
- `.github/workflows/tests.yml`

**Evidence**
- The API client uses `VITE_API_BASE_URL` when set, but otherwise defaults to `http://localhost:5000/api/v1`.
- No `apps/web/.env.example` or production build-time validation for this variable was found.
- CI builds the frontend without setting `VITE_API_BASE_URL`. This is acceptable as a build check, but an artifact produced in that environment must not be promoted directly to production.

**Risk:** if the production build environment omits the variable, the deployed browser will attempt to call the end user's own localhost rather than the hosted API.

**Required remediation**
1. Document the exact production variable and expected value format.
2. Add a safe frontend environment example without credentials.
3. Add a production-build guard or deployment assertion that rejects an unset/localhost API origin.
4. Ensure the release artifact is built with the production API origin and verify its compiled configuration before publication.

**Release gate:** must be verified against the exact production build artifact.

### P1/P2 — Provisionable roles do not have application workspaces

**Status: new provisioning and role assignment of unsupported roles blocked; existing legacy accounts still require review.**

**Affected code**
- `services/api/src/models/User.js`
- `services/api/src/controllers/userManagementController.js`
- `apps/web/src/components/SchoolUserDirectory.jsx`
- `apps/web/src/App.jsx`

**Evidence**
- The user model and school-user creation UI allow `accountant`, `librarian` and `transport_manager`.
- The application router has workspaces for platform administrator, school administrator, principal, teacher, student and parent only.
- The three additional roles fall through to “Workspace unavailable”; no corresponding library or transport module routes were found, and fee routes do not grant the accountant role access.

**Risk:** the school can create and activate an account that cannot perform its assigned job in the application.

**Required remediation / scope decision**
- For this frozen-core release, either remove/deactivate unsupported roles from account provisioning or explicitly defer them and prevent their assignment. Do not represent them as supported roles until their workflows exist.
- If any of these roles are required for the first school, that workflow becomes a release blocker and must be added only through an explicitly approved scope change.

### P2 — Principal sees school-admin-only user management

**Status: remediated in web navigation and route rendering; covered by an App role test.**

**Affected code**
- `apps/web/src/App.jsx`
- `apps/web/src/components/SchoolUserDirectory.jsx`
- `services/api/src/routes/schoolRoutes.js`

**Evidence**
- School administrators and principals receive the same administration navigation, including “User Management”.
- The user-directory component does not hide its read/create/status actions based on role.
- The API user-management routes are restricted to `school_admin`.

**Risk:** principals are presented with controls that return authorization failures. Backend enforcement is correct; the frontend role experience is inconsistent.

**Required remediation:** hide the user-management navigation entry and route for principals, and add an App-level role test proving it is unavailable to principals while remaining available to school administrators.

### P2 — Student/parent portal silently hides several API failures

**Status: remediated with failed-section reporting and retry; covered by a component regression test.**

**Affected code**
- `apps/web/src/components/StudentResultsPortal.jsx`

**Evidence**
- The portal loads ten resources with `Promise.allSettled`.
- It surfaces failures for linked children, profile and published results.
- Failures for homework, submissions, attendance, fees, timetable, announcements and notifications are not surfaced. Those sections can appear empty even when the underlying request failed.
- No overall refresh/retry action for the initial portal data load was found.

**Risk:** users can interpret a service failure as “no records”, especially for fees, attendance and homework.

**Required remediation:** preserve independent section loading where appropriate, but surface each failed section with an explicit error and retry path. Do not silently convert a failed request into an empty dataset.

### P2 — Guardian directory is unbounded

**Status: remediated with server-side pagination, validated filters, stable sorting, bounded offsets and a limited response projection.**

**Affected code**
- `services/api/src/controllers/guardianController.js`
- `apps/web/src/components/GuardianDirectory.jsx`

**Evidence:** the API returns every guardian record in one response; pagination is performed only in the browser.

**Risk:** response size and memory usage grow with school population. This is also unnecessary exposure of fields not required by every directory view.

**Required remediation:** server-side pagination, validated filters, stable sorting and field projection. Include maximum page-size and tenant-isolation tests.

### P2 — Automated release checks do not cover browser E2E or mobile

**Affected code**
- `.github/workflows/tests.yml`
- `apps/mobile/App.js`
- `apps/mobile/package.json`

**Evidence**
- CI runs web lint, web component tests, web build and backend tests against a MongoDB replica set.
- No Playwright/Cypress/browser E2E suite was found.
- The mobile app is currently the Expo starter screen (“Open up App.js to start working on your app!”), has no ERP authentication/workflows, and has no test/lint/build job in CI.

**Risk:** component tests and API integration tests do not prove complete real-browser journeys. The mobile app is not a releasable ERP client.

**Release decision:** if the first release is web-only, explicitly defer mobile and exclude it from release claims. If Android/iOS is part of the first release, mobile implementation and acceptance become a release blocker.

### P2 — Backend lint, coverage thresholds and dependency-security checks are absent from CI

The current workflow does not run a backend lint/static-analysis command, enforce test coverage thresholds, or perform a dependency vulnerability scan. These are assurance gaps, not evidence of a known defect. Establish an appropriate baseline before production, without using broad formatting changes as part of the feature freeze.

### P2 — Authentication rate limiting and proxy configuration need deployment validation

The login/refresh/password-change limiters use the default in-memory rate-limit store. The Express app does not configure `trust proxy`. In a reverse-proxy or multi-replica deployment, client IP handling and rate-limit consistency need explicit validation. A distributed store and correct trusted-proxy configuration may be required by the selected host.

### P2 — Self-service password change and account recovery are incomplete

**Affected code:** `services/api/src/routes/authRoutes.js`, `services/api/src/controllers/authController.js`, `apps/web/src/components/LoginPage.jsx`, `apps/web/src/components/SchoolUserCreation.jsx`.

The API exposes an authenticated change-password endpoint, but no corresponding web workflow was found. The login page has no forgot/reset-password path, and school user creation requires an administrator to provide an initial password.

**Risk:** users cannot conveniently change a known password or recover an account through the web application. This increases support dependency and creates a manual credential hand-off process.

**Release decision:** confirm whether first-release users will receive passwords through a controlled onboarding process. If self-service change/reset is required, treat it as a release requirement rather than silently assuming the API endpoint is a usable UI feature.

### P3 — In-app notification scope must be explicit

The notification worker validates that the recipient account is active and marks the database notification as delivered. The repository does not contain an email, SMS or mobile-push transport integration. The current verified capability is in-app notifications. If external delivery is promised for launch, that is an unmet release requirement.

## 4. First-release scope confirmations

The repository evidence leaves these product decisions to be confirmed before release:

1. **Web versus mobile:** the web application is the implemented client. The Expo mobile app remains a starter screen with no ERP workflows. A first release must be explicitly web-only, or mobile must be treated as a separate unfinished release surface.
2. **Provisionable roles:** only platform administrator, school administrator, principal, teacher, student and parent have application workspaces. Accountant, librarian and transport-manager provisioning is now blocked; any legacy accounts with those roles must be reassigned or suspended.
3. **Teacher guardian access:** the implemented policy now permits teachers to read guardian details only through an assigned-student context. School-wide guardian directory/detail access is restricted to school administrators and principals.
4. **Notifications:** the verified capability is in-app notifications. No email, SMS or mobile-push transport provider is configured in the repository.
5. **Fee payments:** the fee module records payments and receipts; no online payment-gateway integration was found. Confirm whether the first release requires online parent payments or only school-recorded payments.
6. **Password onboarding/recovery:** school user creation requires an administrator-supplied initial password. A self-service change-password API exists, but no web UI or forgot/reset-password flow was found.
7. **Browser acceptance:** automated API and component tests exist, but there is no browser-level end-to-end suite. Real role workflows still need a controlled acceptance pass using synthetic school data.

These are scope/operational decisions, not authorization to add new modules during the freeze. Any new capability requires separate approval.

## 5. Production/operations gates not verifiable from repository CI

These require the actual hosting and database environments; passing local tests or GitHub Actions cannot substitute for them.

| Gate | Current evidence | Required before release |
|---|---|---|
| Production database backup | No provider, destination, schedule or retention configured in repository documentation | Configure protected backups/PITR, retention, monitoring and owner |
| Restore drill | No completed drill evidence | Restore to isolated staging, validate critical data/indexes/tenant boundaries and record RPO/RTO |
| Deployment | No provider, target, infrastructure-as-code or deployment workflow defined | Record services/domains/secrets and deploy exact reviewed SHA |
| Rollback | Provider-neutral runbook only | Exercise rollback using recorded last-known-good artifacts |
| Shutdown grace period | Graceful shutdown code exists; host deadline unverified | Test SIGTERM, in-flight requests, worker drain and database disconnect on selected host |
| Worker scaling | Atomic claim/lease/idempotency code exists; multi-replica behaviour not exercised | Validate queue ownership, per-replica readiness and aggregate polling under intended replica count |
| Browser acceptance | Component/API tests exist; no browser E2E suite found | Complete role-by-role school acceptance with synthetic data |
| Load/performance | Schema index contracts exist; no production query-plan or load-test evidence | Validate critical query plans, response times and capacity using realistic school volumes |

The production deployment runbook must also be updated to require `VITE_API_BASE_URL` at frontend build time.

## 6. Release role/workflow matrix

| Role | Current workspace | Audit status |
|---|---|---|
| Platform administrator | Platform workspace | Implemented; complete live acceptance still required |
| School administrator | School administration workspace | Implemented; complete live acceptance still required |
| Principal | School administration workspace | Implemented; user-management navigation mismatch |
| Teacher | Teacher workspace | Main assignment-scoped workflows exist; guardian-data access is a release blocker |
| Student | Student portal | Implemented; portal partial-failure handling needs remediation |
| Parent | Family portal | Implemented; portal partial-failure handling needs remediation |
| Accountant | No workspace | Not supported for this release unless scope is explicitly expanded |
| Librarian | No workspace | Not supported for this release unless scope is explicitly expanded |
| Transport manager | No workspace | Not supported for this release unless scope is explicitly expanded |

## 7. Recommended remediation order

1. Close guardian privacy/assignment-scope exposure and replace permissive regression tests.
2. Make role provisioning consistent with the workspaces actually supported; correct principal navigation.
3. Make portal partial failures visible and retryable.
4. Add server-side guardian directory pagination and response projection.
5. Guard production frontend API-origin configuration and update deployment documentation.
6. Add browser-level acceptance coverage for the release-critical role journeys; decide web-only versus mobile scope.
7. Complete provider-specific backup, restore, deploy, rollback, shutdown, monitoring and load evidence.

## 8. Freeze and release decision

The core feature freeze remains in effect. Only audit-driven defect fixes, security/privacy fixes, reliability improvements, test coverage and release documentation are permitted without a separate scope approval.

**Current decision: NOT APPROVED FOR PRODUCTION RELEASE.**

The repository has passed its current automated suite, but release approval requires the P1 findings above to be closed, the supported role/surface scope to be explicit, and the external operational gates to have recorded evidence.
