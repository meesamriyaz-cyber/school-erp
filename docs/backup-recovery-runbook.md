# Database Backup and Recovery Runbook

## Scope and current implementation

The API persists application data in MongoDB through Mongoose and selects its
runtime connection string by `NODE_ENV`: `MONGO_DEV_URI` for development,
`MONGO_TEST_URI` for tests, and `MONGO_URI` for production. The repository does not currently
define a production MongoDB provider, backup destination, backup schedule,
retention policy, or automated restore workflow.

This runbook defines the operational controls required before production
onboarding. It does not claim that production backups or a restore exercise
have already been configured or completed.

This runbook covers MongoDB data. If production stores uploaded documents,
images, exports, or other user content in object storage or another external
service, that storage must have its own backup, retention, access-control, and
restore procedure. A MongoDB dump does not back up external object storage.

## Ownership and recovery objectives

Before launch, the service owner must record and approve:

- MongoDB hosting/provider and production cluster identifier.
- Backup mechanism: provider-managed snapshots/point-in-time recovery, or
  MongoDB Database Tools on a self-managed deployment.
- Encrypted backup destination and the identity/service account allowed to
  write and read backups.
- Backup cadence and retention period, based on contractual, legal, and
  operational requirements.
- Recovery Point Objective (RPO): maximum acceptable data loss.
- Recovery Time Objective (RTO): target time to restore service.
- Primary operator and alternate recovery contact.
- Location and access procedure for encryption keys and recovery credentials.

Do not treat example retention periods or provider defaults as an approved
policy. The service owner must set values appropriate to the deployment.

## Required backup controls

1. Prefer the MongoDB provider's supported automated backups and
   point-in-time recovery for managed clusters. Enable them in the provider
   console and verify the configured cluster, schedule, retention, and
   restore permissions.
2. For self-managed replica sets, use a consistent replica-set backup method.
   MongoDB Database Tools `mongodump --oplog` can capture a full dump with
   oplog data for point-in-time replay. Follow the installed tools version's
   documentation and test against the deployed MongoDB version.
3. Encrypt backups in transit and at rest. Keep encryption keys separate from
   the backup files and restrict key access to recovery operators.
4. Use a dedicated least-privilege backup identity. Do not use application
   credentials if the provider supports a separate backup role.
5. Keep at least one protected copy outside the production cluster/account or
   in a provider-supported immutable backup vault, where feasible.
6. Monitor backup job success, backup age, destination capacity, and retention
   enforcement. Alert on missed schedules and failed jobs.
7. Never store production URIs, passwords, access tokens, private keys, or
   decrypted backup files in this repository, CI logs, tickets, or chat.
8. Back up external file/object storage separately and record how its
   versioning and retention align with database recovery.

## Self-managed MongoDB Database Tools example

Use this path only for a self-managed MongoDB replica set where the installed
MongoDB Database Tools version supports the options below. Provider-managed
clusters should normally use their supported backup and point-in-time recovery
features instead.

Create a MongoDB Database Tools configuration file on the secured operator
host. Keep it outside the repository, restrict it to the operator account
(for example, Unix mode `0600`), and populate its URI using the provider's
credential guidance. Do not paste a credentialed URI into a shell command or
commit the configuration file.

Example configuration file structure:

```yaml
uri: "mongodb://<backup-user>:<secret>@<replica-set-hosts>/<database>?replicaSet=<replica-set-name>&authSource=admin"
```

Create a protected backup destination and capture a full replica-set dump:

```bash
umask 077
export MONGODB_TOOLS_CONFIG="/secure/path/mongodb-backup.yml"
export BACKUP_DIR="/secure/backup/location"
export BACKUP_FILE="$BACKUP_DIR/school-erp-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"

mkdir -p "$BACKUP_DIR"
mongodump --config="$MONGODB_TOOLS_CONFIG" --archive="$BACKUP_FILE" --gzip --oplog
```

After the command completes:

- Verify its exit code is zero and the archive exists and is non-empty.
- Record the UTC completion time, archive size, tool version, source cluster
  identifier, and backup job result in the approved operational log.
- Transfer the archive to the approved encrypted backup destination.
- Verify the uploaded object/checksum using the storage provider's supported
  mechanism.
- Apply the approved retention and immutability controls.
- Do not delete the source archive until the protected copy has been verified.

The example writes a local archive; it does not configure scheduling, remote
storage, encryption at rest, alerting, or retention by itself.

## Recovery procedure

### 1. Declare and scope the incident

- Confirm the incident commander and recovery operator.
- Identify the affected cluster, suspected data-loss window, and required
  recovery point.
- Record the selected backup/snapshot identifier and its completion time.
- Check whether the incident involves compromised credentials or destructive
  activity. Preserve evidence and rotate affected credentials as required.
- Notify stakeholders according to the organisation's incident process.

### 2. Protect the source

Do not overwrite, drop, or restore over the only surviving production copy.
Preserve the source cluster and relevant logs where possible. If the source may
still contain valid writes, coordinate a controlled maintenance/read-only
window and document how writes after the chosen recovery point will be handled.

### 3. Restore to an isolated staging cluster first

Provision an isolated MongoDB cluster with a compatible MongoDB major version
and required replica-set/transaction capabilities. Restrict network access and
use a dedicated restore identity. Use a separate secured tools configuration
whose URI targets only this staging cluster.

For a full replica-set archive created with `mongodump --oplog`, restore with
oplog replay:

```bash
export RESTORE_TOOLS_CONFIG="/secure/path/mongodb-restore-staging.yml"
export BACKUP_FILE="/secure/backup/location/<verified-backup>.archive.gz"

mongorestore --config="$RESTORE_TOOLS_CONFIG" --archive="$BACKUP_FILE" --gzip --oplogReplay
```

Do not add `--drop` to a routine restore command. If a clean staging database
is required, provision a new empty database/cluster rather than deleting data
from an existing target. Verify the restore URI targets staging before running
the command.

For provider-managed snapshots or point-in-time recovery, use the provider's
documented restore workflow to create a separate cluster at the selected
recovery point. Do not assume a logical dump and a provider snapshot have
identical point-in-time semantics.

### 4. Validate the restored data

Before any production cutover:

- Confirm the restore completed without errors and the target cluster is
  healthy.
- Compare expected database/collection inventory and document counts with
  backup metadata or a known-good baseline.
- Check critical indexes and unique constraints.
- Verify representative school, academic year, student, guardian, enrollment,
  attendance, examination, fee, and audit records.
- Run application integration and smoke tests against the isolated restored
  environment using test accounts.
- Verify tenant boundaries: users from one school cannot read or mutate
  another school's records.
- Check authentication/session behaviour and rotate credentials or revoke
  sessions if the incident requires it.
- Verify external object storage separately and reconcile references to files.
- Record validation evidence, exceptions, and the recovery point achieved.

Do not expose a restored copy to end users until the service owner approves
the validation results.

### 5. Production cutover and post-recovery

- Obtain explicit incident commander/service owner approval.
- Confirm a current pre-cutover snapshot or backup exists.
- Apply the documented maintenance and write-freeze plan.
- Update the production connection configuration through the hosting
  provider's secret manager; never commit connection strings.
- Deploy/restart the API using the normal release process.
- Verify database connectivity, `GET /api/v1/health/ready`, authentication,
  tenant isolation, critical workflows, and background worker health.
- Monitor error rates, database metrics, queue/outbox backlog, and user
  reports.
- Document the actual recovery point, elapsed recovery time, data-loss window,
  decisions, and follow-up actions.

## Restore drill and evidence

Before production launch, perform a restore drill using a non-production
backup and an isolated target. Repeat on a documented cadence and after
material changes to the database provider, backup mechanism, or schema.

A drill is complete only when an operator can:

1. Locate and authenticate to the protected backup.
2. Restore it to an isolated compatible cluster.
3. Validate collections, indexes, critical records, and tenant isolation.
4. Start the API against the restored cluster and pass agreed smoke tests.
5. Record elapsed time and compare achieved RPO/RTO with approved objectives.

Store evidence in the approved operational system, not in this source
repository if it contains customer data, credentials, or sensitive metadata.
Record the drill date, operator, backup identifier (non-secret), source/target
versions, result, measured recovery time, and corrective actions.

## Release gate

Production launch must remain blocked until the service owner confirms:

- A production backup mechanism and protected destination are configured.
- Backup cadence, retention, RPO, and RTO are approved.
- Backup success/failure and backup-age monitoring are active.
- Backup and restore identities follow least privilege.
- A restore drill has succeeded and evidence is retained.
- External file/object storage recovery is covered, if applicable.
- Recovery operators know where the runbook and secure credentials are held.

A passing CI test suite does not prove that production backups exist or that a
real restore has succeeded.
