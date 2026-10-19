# IMK-001 verification evidence — 2026-10-19

## Passed in artifact-generation environment
- `npm run check:offline`: PASS
- Structural and policy validator (`scripts/verify_project.py`): PASS
- 16 domain unit tests (`node --test ...`): 16 PASS, 0 FAIL
- `bash -n scripts/*.sh`: PASS
- Offline task planner: generated `engineering/NEXT_TASK.md`

## Not verifiable in this environment
- `npm install`: timed out; no complete node_modules tree downloaded. Consequently full Next.js and NestJS compilation/build not run here.
- Docker Compose and local PostgreSQL runtime: Docker not installed; migrations and REST handlers not exercised live.
- Flutter SDK/Android emulator/macOS: not installed; Flutter compile and device tests not run.
- Codex coding-agent runner: not invoked; script integration must be verified on an authenticated workstation.
- GitHub Actions: workflow is authored but not executed in GitHub, as there is no existing IMarket repository under the linked GitHub account.

## Claims carefully limited
This is a tested **offline development starter**, not a complete working deployment or production-ready e-commerce application. Before opening access to real customers, implement proper identity, permissions, payment legal compliance, threat model and operation reviews.

# IMK-002 local implementation evidence — 2026-10-19

Implemented database-backed synthetic login/session revocation, salted scrypt credentials, default-deny global API RBAC, merchant-scoped campaign creation with a composite SQL ownership FK, authenticated buyer ownership, strict request field validation, shared atomic rate limits, and a fail-closed admin login with documented MFA design. See `docs/AUTHENTICATION.md` for setup and security limitations.

- `npm run check:offline`: passed, including the two new authentication primitive tests and existing domain checks.
- `npm run test -w @imarket/api`: passed compilation and database-double API tests. Direct execution of `apps/api/test/auth.test.cjs` reports 7 passing cases (session lifecycle, credential failures/admin denial, concurrent login limits, RBAC, negative tenant access, invalid input, buyer ownership/rollback).
- PostgreSQL 18 single-user mode: applied migrations 001 and 002 and reran them successfully, with no SQL errors. This validates syntax/idempotency, not live transactional behavior.
- The opt-in PostgreSQL integration test is explicitly skipped without `IMARKET_TEST_DATABASE_URL`. It covers SQL tenant constraints, expiry and concurrent atomic limits in an isolated schema. Live execution was blocked: the sandbox refuses PostgreSQL TCP/Unix socket creation and Docker socket access.
- `npm run ci`: offline/API checks pass; full CI fails at Next.js web TypeScript setup, `Could not parse output from TypeScript's --showConfig`. A child-process probe reports `spawnSync /usr/bin/node EPERM` and empty output; direct TypeScript `--showConfig` succeeds. No checks were disabled. Full CI remains unverified until run in an environment permitting required child processes.
- Git metadata is read-only: creating `feature/imk-002-auth-tenancy` failed. Edits remain on the pre-existing `feature/imk-002-agent-proposal` branch, uncommitted.

Remaining: run full CI and PostgreSQL integration tests in an unrestricted local test environment; review administrator MFA implementation, abuse controls and tenancy before enabling real authentication. No merge, deployment or release approval is proposed. Backlog IMK-002 remains unclosed pending verification/review. After closing IMK-002, the exact next numbered milestone is IMK-003 (verified inventory and order lifecycle).


# IMK-002 verification continuation — 2026-10-19

Work remains on `feature/imk-002-agent-proposal`, with the pre-existing uncommitted implementation preserved. This continuation changes only API tests and authentication/verification documentation. No commit, push, merge, deployment, payment enablement or security-control bypass was performed. No application/customer database was used.

## Exact results

Environment: Node 24.19.0, local PostgreSQL binaries 18.3; installed workspace dependencies.

| Command / check | Result |
|---|---|
| `npm run check:offline` | Exit 0; structural/safety validator passed (14 required files, 7 milestones). Default runner reports two passing domain test files. |
| `npm run ci` (final run) | Exit 1. Offline checks and API compilation/test command succeeded; API build succeeded again; Next.js compiled, then failed with `Could not parse output from TypeScript's --showConfig.` Full CI did **not** pass. |
| `node apps/api/test/auth.test.cjs` | 11 passed, 0 failed, 0 skipped (7 existing cases plus 4 new negative-test cases). |
| `node apps/api/test/postgres.test.cjs` | 0 passed, 0 failed, **1 skipped**: `IMARKET_TEST_DATABASE_URL` is unset. |
| `node --test --experimental-test-isolation=none packages/commerce-domain/*.test.cjs apps/api/test/*.test.cjs` | 30 individual cases: **29 passed, 0 failed, 1 skipped** (18 domain, 11 database-double API cases passed; PostgreSQL case skipped). |
| `node --check` on both API test files; `git diff --check` | Passed. |
| Direct `tsc --showConfig -p apps/web/tsconfig.json` | Exit 0; output parses as JSON with compilerOptions. This does not establish a passing Next.js build. |

The default subprocess-based `node --test` runner reports test-file passes here without exposing the inner PostgreSQL skip. Those file-level results are not evidence of passing PostgreSQL checks; the individual-case command above is the authoritative count for this run.

## Isolation attempt and database blocker

Created a new disposable cluster with `initdb` at `/tmp/imk002-pg.M0bf5c/data`; initialization succeeded. Started it with TCP disabled (`-h ''`), a private Unix socket directory `/tmp/imk002-pg.M0bf5c` and port 55482. Startup failed: `could not bind Unix address ... Operation not permitted`, followed by `FATAL: could not create any Unix-domain sockets`. PostgreSQL shut down; no database server was left running. No existing database, Docker volume, production or customer data was accessed. The test URL remains unset; live integration assertions were not executed.

The integration test now requires a loopback URL, a dedicated `imarket_test_*` database name, no connection query overrides and nonproduction mode before creating a pool. It uses a random schema without `public` fallback, bounded connection waits and conditional schema cleanup. These guards reduce accidental targeting; the operator must still create a fresh disposable database.

## Coverage and remaining limits

Passing database-double tests cover absolute session expiry, hashed token storage, logout, disabled accounts, anonymous access, buyer/merchant role restrictions, cross-tenant campaign rejection, authenticated buyer ownership, duplicate-join rollback, and shared alias login limits. Added negative cases cover malformed/oversized login fields (including multibyte password limits), storage failures denying login/mutations, merchant role without tenancy, logout authorization, mutation quota enforcement, unknown-controller denial, invalid UUIDs, and noninteger/unsafe campaign values.

Expanded PostgreSQL assertions cover migration reruns; account alias/hash/role/merchant checks; duplicate accounts and tokens; session foreign keys and hash format; token lifetime, disablement, current role and logout; cross-tenant campaign insertion and product ownership reassignment; duplicate account joins and expired campaigns; positive limit counters; concurrent login alias limits (5 credential failures, 5 throttled), shared IP limits (30 credential failures, 5 throttled), atomic counters and expired-window reset. **All of these live assertions remain unverified**, including the newly added assertions. Database-double concurrency cannot establish PostgreSQL atomicity. No real HTTP/socket integration run was possible.

Full CI remains blocked at Next.js TypeScript setup. A child-process probe reported `EPERM` even while returning Node version output and status 0; direct TypeScript configuration parsing succeeded. This supports an environment restriction hypothesis but does not prove the complete cause of Next.js failure. No application changes or security relaxations were made to bypass it; no merge is proposed.

The exact next verification milestone is to run both `IMARKET_TEST_DATABASE_URL=<fresh loopback imarket_test_* database URL> npm run ci` and the individual-case command with the same environment in a local environment permitting PostgreSQL sockets and required child processes, obtaining zero skipped integration cases and a passing full build. IMK-002 remains open pending that evidence and human tenancy/abuse/MFA-design review. Administrator MFA remains design-only; real authentication/seller access and production remain gated. After IMK-002 is closed, the next numbered implementation milestone is IMK-003 (verified inventory and order lifecycle).

## IMK-002 intermittent rejection investigation (2026-10-19)

The reported `r.reason?.getStatus is not a function` is a diagnostic defect: optional chaining checks whether `reason` is nullish, not whether its `getStatus` property is callable. A non-HTTP rejection therefore replaces the useful original error with a TypeError while counting concurrent outcomes. It proves an unexpected rejection occurred, but does not establish whether that rejection came from PostgreSQL, connection setup/pool acquisition, scrypt, or a programming defect. No original rejection/stack was available from that run. Authentication awaits its database and password operations without converting their errors into HTTP exceptions; this fail-closed behavior is retained. There is insufficient evidence to change SQL, password handling, pool sizing or timeouts.

Changes: shared test assertion `apps/api/test/settled-http.cjs` validates all outcomes before counting, requires actual Nest `HttpException` instances, retains exact 401/429 counts, and fails on unexpected fulfillment/status or any non-HTTP rejection. An AggregateError contains indexed failures with each original rejection retained as `cause`, preserving error type, PostgreSQL SQLSTATE/connection code and stack rather than masking them. Applied to both login batches and the rejected atomic-limit batch (the exact five-success assertion remains), plus the database-double login test. Negative regression tests cover raw SQL errors, connection errors, programming errors, null and HTTP-shaped impostors, unexpected fulfillment/status and incorrect counts. Separate concurrent login checks prove original raw error identity is preserved. No authentication behavior or database safeguards were changed.

Validation in this sandbox, using only the preconfigured loopback `IMARKET_TEST_DATABASE_URL` dedicated `imarket_test_*` database target, with no URL changes:

- `npm run check:offline`: passed structural/security gates and domain test files.
- `npm run ci`: failed at the PostgreSQL API test; the API build and database-double test file passed. No integration skip was used.
- `node --test --experimental-test-isolation=none packages/commerce-domain/*.test.cjs apps/api/test/*.test.cjs`: 32 cases, 31 passed, 1 failed, 0 skipped. All 13 API database-double cases and 18 domain cases passed. PostgreSQL failed at the initial schema-creation connection with `connect EPERM 127.0.0.1:5433`.
- Standalone PostgreSQL test: one baseline attempt and three successive post-change attempts all failed at that same initial connection, before migrations or concurrent operations. No schema was created and no cleanup SQL was needed. The original intermittent concurrent rejection could not be reproduced or diagnosed beyond fixing its masking assertion.
- Separate `npm run build`: API TypeScript passed; web compilation succeeded, then Next.js failed with `Could not parse output from TypeScript's --showConfig.` Full build remains unsuccessful; no unrelated web changes were made.
- `git diff --check`: passed. Feature branch creation was attempted but denied because `.git` is read-only in this environment; changes remain uncommitted on the existing branch.

Unresolved: sandbox network permission prevents live PostgreSQL verification. Exact next milestone: rerun the standalone PostgreSQL test repeatedly, the individual-case suite and `npm run ci` in an environment permitting the same isolated test database connection and build subprocesses. If concurrent operations reject, inspect the AggregateError causes and correct the evidenced underlying failure; do not accept non-HTTP errors as credential failures/throttling. IMK-002 remains open until this succeeds and required review is complete; IMK-003 follows. No commit, merge, deployment or payment enablement occurred.
