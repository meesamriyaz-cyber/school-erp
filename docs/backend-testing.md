# Backend test environment

The API integration suite uses a dedicated MongoDB database named `school-erp-test`.
Never point `MONGO_TEST_URI` at a development or production database. The API
environment loader rejects test database names that do not contain `test`, and
database-backed suites verify the connected database before running.

## Local configuration

Set these values in `services/api/.env`:

```dotenv
NODE_ENV=test
MONGO_DEV_URI=mongodb://127.0.0.1:27017/school-erp-dev?replicaSet=rs0
MONGO_TEST_URI=mongodb://127.0.0.1:27017/school-erp-test?replicaSet=rs0
JWT_ACCESS_SECRET=replace-with-a-random-secret-at-least-32-bytes
JWT_REFRESH_SECRET=use-a-different-random-secret-at-least-32-bytes
WEB_URL=http://localhost:5173
```

The MongoDB deployment must support transactions (a replica set or sharded
cluster). A local MongoDB replica set is closest to the GitHub Actions setup.
An Atlas test cluster is also supported; use its URI with the database path
set to `school-erp-test`. Do not commit credentials or paste a credentialed
URI into logs or diagnostics.

## Run tests

From the repository root:

```bash
pnpm --filter @school-erp/api test
```

The API test script disables Vitest file-level parallelism. This is intentional:
multiple integration test files share Mongoose's process-level connection and
some suites open HTTP servers. Serial file execution avoids tests racing while
connecting or disconnecting the shared Mongoose connection. Individual tests
within a file retain their normal Vitest behavior.

GitHub Actions uses the same package script against a fresh MongoDB 7 replica
set and the same dedicated database name. If a local failure occurs, retain the
failing test name and error output; do not increase timeouts or change
production password-hashing settings without identifying the underlying cause.

## Environment safety

- `MONGO_DEV_URI` is mandatory when `NODE_ENV=development` and is selected by
  the API environment loader.
- `MONGO_TEST_URI` is mandatory when `NODE_ENV=test` and is selected by the
  API environment loader.
- `MONGO_URI` is reserved for `NODE_ENV=production`; do not place its value in
  development or test CI configuration.
- The loader rejects a selected URI that resolves to the same MongoDB host and
  database as another configured environment URI.
- The database name must be exactly `school-erp-test` for database-backed
  integration suites.
- Use disposable test data. Suites should create uniquely named records and
  clean up only records they created; never drop the entire database.
