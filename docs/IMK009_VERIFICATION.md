# IMK-009 local implementation and verification

## Latest continuation — 2026-10-24

All pre-existing modified, staged and untracked files were preserved on the
existing feature branch. Added strict own-property validation for fulfillment
statuses: inherited names (`constructor`, `toString`, `__proto__`) now return
400 before opening a transaction. A regression also covers unknown, initial,
cancelled and non-string status inputs.

| Check | Status | Evidence |
|---|---|---|
| Offline checks, API TypeScript and Next.js production build | PASS | Serial final strict CI; `/tmp/imk009-resume-final-ci.log`. |
| Strict backend/PostgreSQL CI | FAIL | 64 tests, 63 pass, one fails, zero skips. Dedicated loopback PostgreSQL connection fails with EPERM before database assertions. Report: `/tmp/imarket-validation-WUL1TK/report.json`. |
| Flutter analysis | PASS | No issues; `/tmp/imk009-resume-analysis.log`. |
| Flutter tests | FAIL | Three files fail loading because loopback socket binding is forbidden; zero test bodies executed. `/tmp/imk009-resume-flutter.log`. The 22-test baseline remains unreproduced. |
| Fresh Android debug APK | FAIL | Gradle dependency download fails with `java.net.SocketException: Operation not permitted`; `/tmp/imk009-resume-apk.log`. |
| Synthetic browser journeys | FAIL | Production build passes, fixture bind fails with EPERM on 127.0.0.1:4000; no browser assertions execute. `/tmp/imk009-resume-browser.log`. |
| PostgreSQL concurrency/rollback, Flutter runtime, integrated browser/API/database journey | DEFERRED | Requires local sockets and available build dependencies. |
| Emulator, device and live capability testing | DEFERRED | Excluded by the user; no emulator, real payments, credit, shipping, external notifications or live onboarding enabled. |

An initial parallel build check encountered the Next.js build lock; the final
serial strict CI above supersedes that attempt and completes both builds.
No commit, merge, push, deployment or cloud resource creation occurred.
IMK-009 remains incomplete. Exact next milestone: run strict CI with zero
failures/skips on a disposable PostgreSQL target, all 24 Flutter tests, a fresh
debug APK, synthetic browser checks and an integrated API/database browser
journey in an environment permitting local sockets and Gradle dependencies.

Work is on `feature/imk-009-agent-proposal`. This milestone remains incomplete
until the runtime gates below pass. No release is proposed.

## Implemented

The existing merchant-owned `reserved → processing → shipped → delivered`
workflow still locks the order row and rejects skipped transitions, cancellation
of processed orders and other merchants. Completed steps now use persisted audit
actions as retry receipts: a delayed processing retry after delivery returns the
current delivered state without another mutation, notification or stock change.
The lifecycle is the operation identity; there is no reusable client key.

Migration 007 adds private buyer notifications referenced to immutable audit
records. Its audit insert trigger records order/dispute activity in the same
transaction. Failures roll back state, audit and notification together. Existing
activity is available in timelines; notifications start with new audit inserts
after migration. No historical notification backfill or external delivery occurs.
Audit timestamps now use insertion time after lock waits.
The local migration runner includes 007; no application database was migrated.

Owned order details include an ordered audit timeline covering the order and its
dispute. Notification list/read endpoints derive the account from the session;
read acknowledgement is idempotent. Responses omit credentials, dispute content
and actor identifiers. Lists return at most 100 notifications; pagination and
background/push notification delivery are outside this milestone.

Web and Flutter expose owned order timelines and on-demand private notification
lists with read acknowledgements. Web clears the timeline on logout and remounts
notifications per session. Flutter dialogs display activity without storing it
outside the session. All fulfillment labels are simulated; there is no shipping,
payment, identity, lending, publishing, cloud or deployment integration.

## Verification — 2026-10-24

- `npm run check:offline`: passed.
- `npm run ci`: API/web builds and offline checks passed; 60 tests passed,
  zero failed, one required PostgreSQL test skipped because the dedicated URL was
  unset. Strict CI exited 1 as required. Final report:
  `/tmp/imarket-validation-vKs1Hf/report.json`; output `/tmp/imk009-ci-final.log`.
- Explicit guarded local PostgreSQL attempt failed with
  `connect EPERM 127.0.0.1:55439`, before any database assertion executed.
  `/tmp/imk009-postgres.log`.
- Flutter analysis: passed, no issues. `/tmp/imk009-mobile-analyze.log`.
- Flutter tests: blocked loading all three test files by loopback socket denial;
  zero test bodies executed. `/tmp/imk009-flutter-test.log`.
- Automated coverage added: owned detail denial, notification ownership/role and
  payload rejection, escaped web timeline rendering, delayed fulfillment replay,
  Flutter authenticated timeline/notification contracts, and guarded PostgreSQL
  concurrent fulfillment retries, audit rollback, timeline/dispute linkage and
  cross-account notification read denial. SQL and Flutter runtime assertions
  remain unverified in this sandbox. Browser interaction is also unverified.

Exact next milestone: finish IMK-009 verification with all PostgreSQL migration,
concurrency and HTTP assertions passing on a disposable loopback `imarket_test_*`
database, zero CI skips, and Flutter widget execution plus browser interaction
checks. Correct runtime defects before marking IMK-009 verified. IMK-004,
IMK-006 and IMK-007 release gates remain blocked.

## Continuation evidence — 2026-10-24

This section supersedes earlier runtime counts and the statement that no browser
runner exists. IMK-009 is **incomplete**, with runtime verification blocked.
The existing feature branch, index and all previously modified/untracked files
were preserved, including the unrelated untracked file. Nothing was staged,
committed, merged, pushed or deployed. No emulator or device was used.

### Additional implementation

- Migration 007 now rejects UPDATE, DELETE and TRUNCATE on marketplace audit
  history with database triggers, while allowing append-only activity inserts.
  This protects normal application SQL; privileged database owners can still
  alter schema and require operational access controls before release.
- PostgreSQL assertions now cover audit immutability; notification-insertion
  failure rolling back fulfillment and audit together; one cancellation event
  and notification after concurrent retries; and matching dispute open,
  response and resolution activity in both timelines and private notifications.
- Controller regressions cover notification account scoping, private response
  fields, and fulfillment rollback/release on activity insertion failure.
- Web notifications show loading, initial, empty, failure and read states,
  disable concurrent UI actions and update the read receipt directly. Selected
  timelines refresh after order mutations and identify the tracked order.
  Private activity and order identifiers wrap at narrow widths.
- Flutter keeps the notification dialog open on read, shows Read on success,
  retains unread activity on failure and supports retry. Empty order timelines
  have an explicit message. All previous cases remain; two new regressions
  cover failed-read recovery and an empty notification center. There are 24
  defined test cases, including parameterized cases, versus the user's 22-test
  baseline. Their runtime success is not established by analysis.
- Added the missing `scripts/test-browser.cjs` command target, using native
  Chromium DevTools and synthetic HTTP fixtures without new dependencies.
  `npm run test:browser` pins its build API URL to loopback. The runner checks
  merchant fulfillment, customer tracking, notification read/retry/empty states,
  logout clearing and three viewport widths. Instructions and scope are in
  [the browser README](../apps/web/test/README.md). This is a UI fixture suite,
  not a replacement for real PostgreSQL/HTTP tests or a fully integrated
  browser/database journey.

### Executed checks

| Check | Status | Current evidence |
|---|---|---|
| `npm run check:offline` | PASS | Run within final strict CI; structural/security checks and domain tests pass. |
| Strict `npm run ci` | FAIL | 63 tests: 62 pass, 1 fails, zero skips. Explicit disposable loopback PostgreSQL target fails `connect EPERM`; database assertions do not execute. |
| API TypeScript build | PASS | Final strict CI and browser command compile successfully. |
| Next.js production build | PASS | Final strict CI and browser command build `/`, `/merchant`, `/admin`. |
| Flutter analysis | PASS | Final `flutter analyze --no-pub`: no issues found. |
| Flutter tests | FAIL | All three test files fail loading on denied 127.0.0.1 socket creation; zero test bodies run. The earlier 22 passing tests are user-provided baseline evidence, not reproduced here. |
| Android debug APK | FAIL | `flutter build apk --debug --no-pub` reaches Gradle download and fails with `java.net.SocketException: Operation not permitted`. An existing ignored APK is preserved; no newly built APK is claimed. |
| Synthetic browser command | FAIL | Builds pass, then fixture server cannot bind 127.0.0.1:4000 (`EPERM`); no browser assertions execute. |
| Script syntax and whitespace | PASS | `node --check` for browser and controller regression scripts; staged/unstaged `git diff --check`. |
| PostgreSQL concurrency, immutability and rollback runtime evidence | DEFERRED | Assertions added/preserved, but no PostgreSQL connection is permitted in this sandbox. |
| Fully integrated browser/API/database journey | DEFERRED | UI fixture coverage and backend HTTP tests are separate; neither establishes an integrated browser/database pass. |
| Emulator/device and manual accessibility testing | DEFERRED | Device testing excluded by user; no emulator started. Browser overflow checks are not a full accessibility audit. |
| Release and live capabilities | DEFERRED | No release authorization; real payments, credit, shipping, external notifications and live customer onboarding remain disabled. |

Logs: `/tmp/imk009-continuation-final-ci.log`, structured report
`/tmp/imarket-validation-uIM3PU/report.json`,
`/tmp/imk009-continuation-final-analysis.log`,
`/tmp/imk009-continuation-final-flutter-test.log`,
`/tmp/imk009-continuation-apk.log`,
`/tmp/imk009-continuation-final-browser.log`.
Temporary logs are local execution evidence and may not persist across sessions.
Mobile commands used the existing writable temporary Flutter launcher, temporary
HOME and Gradle cache; no SDK or machine caches were added to source control.

Exact next milestone: in an environment allowing local sockets, run strict
`npm run ci` with a disposable `IMARKET_TEST_DATABASE_URL` (loopback,
`imarket_test_*`, no URL overrides), obtaining zero failures/skips; execute all
24 Flutter tests; build a fresh debug APK with available Gradle dependencies;
run `npm run test:browser` and a real API/PostgreSQL-backed browser journey.
Correct runtime defects before marking IMK-009 verified. This milestone needs
no emulator. IMK-004, IMK-006 and IMK-007 remain blocked by their release gates.
