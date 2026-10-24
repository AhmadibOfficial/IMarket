# IMK-008 verification — 2026-10-23

IMK-008 remains incomplete. This continuation preserves
`feature/imk-008-agent-proposal`, prior staged changes, untracked additions and
Android scaffolding. No commit, push, merge, deployment, emulator, device,
ADB invocation, installation, real payment or lending action was performed.
Earlier reported 55 API / 19 Flutter passes and a debug APK build are historical
user-provided evidence, not results reproduced in this sandbox.

## Changes in this continuation

- `apps/api/src/api.controller.ts`: parameterized public discovery filters;
  group creation additionally checks publication, product approval and merchant
  approval while retaining tenant ownership checks.
- `apps/api/test/social.test.cjs`: negative filter validation, literal search,
  price boundaries and merchant product eligibility regressions.
- `apps/api/test/postgres.test.cjs`: real database discovery/filter/suspension
  and unpublished-product group creation assertions, in the existing guarded suite.
- `apps/web/app/page.tsx`: API-backed search/category filters, quantity editing,
  advisory live countdowns, loading and empty states. Refresh retains filters.
- `apps/mobile/lib/main.dart`: the same search/category API contracts, disposable
  countdown timer and injected clock. Existing cart, invitation, checkout,
  owned-order and dispute flows are retained.
- `apps/mobile/test/store_test.dart`: encoded filter request and deterministic
  UTC countdown regressions; empty-state expectation follows the new wording.
- `apps/mobile/android/.gitignore`: stop ignoring the existing Gradle wrapper
  JAR and launchers. These are now untracked and reviewable; nothing was staged.
- `apps/mobile/README.md`, `apps/mobile/test/README.md`: device-free automated
  verification instructions and current evidence pointers.
- This report, `docs/SOCIAL_SHOPPING.md`, `engineering/NEXT_TASK.md`: current
  verification status and next milestone.

## API and client contracts

`GET /api/products` accepts optional `q` (literal case-insensitive name/description
substring), `category` (case-insensitive exact category), `minPriceKobo` and
`maxPriceKobo` (inclusive single-item prices in integer kobo, 0–1,000,000,000).
Text is limited to 100 characters. Unknown keys, non-scalar filters, invalid
numbers and reversed ranges return 400. Empty filters preserve discovery.
Filtering retains the published, in-stock and approved-merchant visibility rules;
results are ordered by name and ID. Both customer clients send text/category
filters to this endpoint; they show product descriptions inline from API data.

Merchant web creation uses `POST /api/groups`; buyer clients only join and check
out. Buyer sessions, server membership and stock checks remain authoritative.
Invitations expose a public campaign ID, not identity or session information.
Countdowns display local time remaining and cannot settle or authorize a group.
Cart checkout sends product IDs, quantities and a retry key, never prices or
customer ownership. Group checkout sends an empty object. Owned details/history,
cancellation and disputes retain the existing API paths and authorization.

## Executed checks

| Check | Result | Evidence |
|---|---|---|
| `npm run check:offline` | PASS | Executed by final CI; structural/safety checks and domain tests pass. |
| API build | PASS | Final CI TypeScript compilation. |
| Next.js build | PASS | Final CI compiles `/`, `/merchant`, `/admin`. |
| Social controller regressions | PASS | 9 passed, zero failures/skips; `/tmp/imk008-social-final.log`. |
| `npm run ci` | FAIL | 57 tests: 56 pass, 1 fail, 0 skips; mandatory PostgreSQL connection denied. |
| Existing PostgreSQL cluster startup | FAIL | Existing `/tmp/imarket-imk008-pg` cannot bind 127.0.0.1:55439 (EPERM). No database assertions executed. |
| `flutter pub get --offline` | PASS | Existing dependency cache resolved with temporary writable SDK/HOME. |
| `flutter analyze --no-pub` | PASS | `No issues found!`; `/tmp/imk008-mobile-analysis-final.log`. |
| `flutter test --no-pub` | FAIL | All three files fail loading: runner cannot bind loopback. Zero test bodies execute; no runtime passes claimed. |
| `flutter build apk --debug --no-pub` | FAIL | Initial Gradle cache read-only; writable `GRADLE_USER_HOME` retry reaches download then fails with `SocketException: Operation not permitted`. No new APK claimed. |
| Whitespace and wrapper inspection | PASS | Staged/unstaged `git diff --check`; valid wrapper ZIP with `GradleWrapperMain.class`, executable Unix launcher and Windows launcher present. |
| Automated local browser journey | DEFERRED | Chromium is installed; no browser automation connector/package available, and a local socket probe fails EPERM, preventing the synthetic API/web server environment. |
| Emulator verification | DEFERRED | Explicitly excluded; never launched or required. |
| Physical-device verification | DEFERRED | Explicitly excluded; never connected or required. |

Final CI log: `/tmp/imk008-final-ci-complete.log`; structured report:
`/tmp/imarket-validation-rHBGCr/report.json`. Mobile logs:
`/tmp/imk008-pub.log`, `/tmp/imk008-mobile-analysis-final.log`,
`/tmp/imk008-tests.log`, `/tmp/imk008-apk.log`,
`/tmp/imk008-apk-writable.log`. Database startup:
`/tmp/imk008-pg-current.log`. Temporary logs are local evidence, not repository
artifacts. A full SDK-cache copy exhausted temporary storage during setup; only
that temporary copy was removed and replaced with shared read-only artifacts.
Final CI and mobile checks above ran after recovering space.

## Acceptance criteria

PASS means verified at the scope stated; DEFERRED means required evidence is
missing. Source or fixture coverage alone does not establish end-to-end success.

| Backlog acceptance criterion | Status | Evidence / remaining verification |
|---|---|---|
| Functional Flutter customer shopping | DEFERRED | API-connected source and analysis pass; retained tests plus two new regressions cannot execute in this sandbox. |
| Authenticated group purchasing | DEFERRED | Guard, tenant, payload, membership and settlement unit checks pass; mandatory PostgreSQL/HTTP journey blocked. |
| Social group invitations | DEFERRED | Public-ID clipboard flows and authenticated joins implemented; real browser clipboard/interaction journey unverified. |
| Server-authoritative discounts | DEFERRED | Controller tests verify server pricing and rejection of forged prices; locked PostgreSQL assertions blocked. |
| Atomic stock reservations | DEFERRED | Existing transaction, row-lock and unique-membership paths retained; real concurrency/rollback assertions blocked. |
| Simulated checkout and order history | DEFERRED | Replay/ownership paths and client integrations retained; actual database/customer journey blocked. |
| Buyer protection integration | DEFERRED | Existing owned-order dispute and audit paths connected; PostgreSQL and Flutter journey execution blocked. |
| Accessible web and mobile interfaces | DEFERRED | Responsive forms, labels, live status and large-text tests present; Flutter runtime, keyboard and screen-reader evidence incomplete. |
| PostgreSQL and authorization tests | FAIL | Authorization units pass; mandatory PostgreSQL test fails EPERM, with zero skips. |
| No live payments, lending or deployment | PASS | Offline gates pass; simulated operations only; no release action performed. |

## Engineering review and release blockers

All pre-existing staged files remain staged; this continuation does not stage or
unstage anything. Existing Android configuration, manifests, Kotlin entry point,
resources, dependency manifests and lockfiles are preserved. Main Android manifest
has no debug cleartext exception; the existing exception is in the debug manifest.
Local properties, build output, Dart/Gradle caches, signing keys and keystores
remain ignored. The staged file-name review found no environment/credential,
local-properties, keystore, APK or machine-cache additions. SDK package metadata
contains generated local paths only in ignored `.dart_tool`; no SDK is vendored.
The wrapper JAR and both launchers must be included in eventual human staging.
No new dependency was introduced. Default example Android application ID remains
unsuitable for release and release signing is not configured.

Full CI is red because required infrastructure is unavailable, not because a
check was removed or bypassed. Required release blockers are zero-skip PostgreSQL
security/concurrency execution, Flutter runtime regressions, a reproducible new
APK build, and local browser/accessibility journey evidence. Real authentication
release, payments, finance and production still require the separate gates in
`RELEASE_GATES.md`; IMK-004, IMK-006 and IMK-007 remain blocked.

Exact next milestone: rerun strict CI against the existing guarded loopback
`imarket_test_*` database in an environment permitting local sockets; execute
all retained and new Flutter tests; build the debug APK using writable cached
Android/Gradle dependencies; run the synthetic merchant → two buyer invitation
joins → deadline → simulated checkout/retry → owned history → dispute browser
journey. Fix failures before closing IMK-008. No emulator or physical device is
required for that milestone; both acceptance categories stay DEFERRED.

## Browser integration completion work — 2026-10-24

This section supersedes the earlier statement that no browser automation is
available. The pre-existing untracked DevTools runner and journey were preserved
and extended, with no new dependency. `npm run test:browser` builds and tests
real local Next.js/API/PostgreSQL services with synthetic merchants and buyers.
Kali provisioning, invocation, cleanup, coverage boundaries and troubleshooting
are in [the browser instructions](../apps/web/test/README.md).

The runner requires demo mode and a disposable loopback `imarket_test_*`
database, uses a random private schema, and rejects occupied service ports.
It uses the actual API controllers and global authentication guard. Browser
interactions exercise the storefront and merchant workspace; real HTTP probes
cover security and concurrent replay, with SQL assertions for persisted totals,
ownership, stock and dispute creation. Deadlines and price changes are advanced
only in private fixture data. The merchant selector now targets the buying-group
form specifically, and clipboard permission is granted only to the local origin.
Independent search/category exclusions supplement combined price filtering.

| Browser requirement | Status | Evidence |
|---|---|---|
| Approved merchant discovery | DEFERRED | Automated visible/hidden listing assertions defined; runtime blocked. |
| Search, category, inclusive price filtering | DEFERRED | Independent exclusion, boundary and empty-result checks defined. |
| Cart quantity and simulated checkout | DEFERRED | UI quantity edits, persisted total and HTTP batch replay defined. |
| Merchant authorization, invitations, two-buyer joins | DEFERRED | UI creation, clipboard transfer, join and role/tenant denial checks defined. |
| Expiration, qualification, stock release | DEFERRED | Fixture deadline advance, success/failure, late join and exact stock checks defined. |
| Server-authoritative discounts and retry | DEFERRED | Price update after joins, forged payload denial, UI replay and concurrent HTTP replay defined. |
| Owned history and disputes | DEFERRED | UI details/submission, persisted dispute and foreign buyer/merchant denial defined. |
| Responsive layout and basic accessibility | DEFERRED | 1280/768/360px buyer/merchant overflow, AX names/landmarks/status and keyboard focus checks defined. |
| Browser execution in this sandbox | DEFERRED | Runner exits 1 with EPERM at initial local socket preflight; no database mutation or browser journey executed. Log: `/tmp/imk008-browser-run.log`. |
| Browser scripts syntax | PASS | `node --check` passes for runner and DevTools helper. |
| Emulator and physical device | DEFERRED | Excluded by request; neither used. |

No browser PASS is claimed from source coverage. Financial, identity and
production release gates remain blocked; IMK-008 remains incomplete. Existing
staged and unstaged work is retained; no staging, commit, push, merge or deploy.

Current executed validation for this continuation:

| Check | Status | Evidence |
|---|---|---|
| `npm run check:offline` | PASS | Exit 0; `/tmp/imk008-browser-offline.log`. |
| API and Next.js builds | PASS | Both compile in the current CI run. |
| `npm run ci` | FAIL | Exit 1: 57 tests, 56 pass, zero failed, one mandatory PostgreSQL skip because database URL is unset. Strict zero-skip gate correctly rejects this run. `/tmp/imk008-browser-ci.log`; report `/tmp/imarket-validation-GNigD5/report.json`. |
| Staged and unstaged whitespace | PASS | Both `git diff --check` variants pass. |

Exact next browser milestone: on Kali with loopback enabled, follow
`apps/web/test/README.md`, run strict CI against a disposable PostgreSQL target
with zero skips, then run `npm run test:browser` to exit 0 with the final suite
PASS. Correct any observed runtime failures before changing the browser rows
above to PASS. Manual accessibility review and earlier mobile verification
remain separate outstanding evidence; no emulator/device run is required here.

## Final web integration continuation — 2026-10-24

Preserved the existing branch, index, source changes and earlier evidence. The
user reports newer verified results of **57/57 API tests, 21/21 Flutter tests,
a passing Next.js build and a built Android debug APK**. Those are user-provided
results; this sandbox's runs below do not supersede or reproduce them.

Extended the existing Chromium DevTools suite without adding dependencies:

- The merchant creates a draft through the web form and submits it for review.
  The buyer cannot discover it before approval. A synthetic administrator uses
  real password/TOTP login and the existing administrator review endpoint to
  publish it, after which the buyer discovers it. Merchant approval requirements
  remain enforced; the merchant cannot self-publish.
- The administrator account, random MFA seed and ephemeral encryption key exist
  only in the guarded local test fixture/process. No identity or external service
  is used, and no authentication/MFA check is bypassed.
- Form filling supports a named form so repeated merchant description labels do
  not create ambiguous selectors. Navigation waits for React hydration.
- Both group orders must have the exact two buyer account owners, quantities and
  server totals. Existing stock, replay, dispute and tenant checks are retained.
- Keyboard navigation must reach and activate the invitation copy button with
  Tab/Enter and visible focus. Responsive AX/overflow checks remain at three
  widths. These checks do not establish full WCAG or screen-reader compliance.
- Database URLs must additionally use a PostgreSQL protocol; loopback, database
  name, connection-override and isolated-schema guards remain intact.

Repeatable Kali command and prerequisites remain in
[apps/web/test/README.md](../apps/web/test/README.md): `npm run test:browser`.
The runner uses synthetic accounts and local Next.js/API/PostgreSQL services.
No new customer UI was necessary: existing forms cover the requested journey.

Current observed evidence:

- `npm run check:offline`: **PASS**, exit 0;
  `/tmp/imk008-final-web-offline.log`.
- Browser runner: **BLOCKED**, exit 1, `FAIL browser integration: EPERM` at
  loopback bind preflight; `/tmp/imk008-final-web-browser.log`. No schema,
  service or browser was created and no browser assertions executed.
- Both browser scripts pass `node --check`; staged and unstaged
  `git diff --check` pass.

No emulator, real payment, credit, public onboarding, host clock modification,
commit, push, merge, reset or deployment occurred. Existing evidence is retained.

Final strict CI for this continuation: **FAIL**, exit 1; **57 tests, 56 passed,
1 failed, zero skipped**. The mandatory PostgreSQL case fails with
`connect EPERM 127.0.0.1:5433`. API compilation and the Next.js build both
**PASS**. Log: `/tmp/imk008-final-web-ci.log`; structured report:
`/tmp/imarket-validation-nOMUbA/report.json`. No failing safeguard was weakened.

Exact next milestone: on Kali with local sockets and a disposable guarded
PostgreSQL database, run `npm run ci` with zero failures/skips and then
`npm run test:browser` through its final suite PASS. Fix any demonstrated runtime
failures before marking browser acceptance verified. Full accessibility review
remains separate; no emulator or production release is required or authorized.
