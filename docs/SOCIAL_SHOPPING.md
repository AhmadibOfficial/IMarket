# IMK-008 local social shopping

Synthetic local use only. Release gates remain unchanged. No live payments,
identity collection, lending, external invitations or deployment are enabled.

Web and Flutter buyers can browse public groups, copy a public campaign ID,
paste that ID into the invitation field and join using their authenticated
synthetic alias. Copying uses the platform clipboard; no contacts, recipient
records or external messaging APIs are used. A public ID conveys no authority.
The interfaces show minimum membership, capacity, deadline, state and the
server's current group price. Existing carts, order history and buyer dispute
interfaces remain available. Web controls have labels and status announcements;
Flutter adds a refresh tooltip and a live status region. Manual screen reader,
large text, keyboard and device checks remain required.

POST /api/groups/:id/checkout accepts only an empty object and requires a buyer
session and membership. Before the deadline it creates no order. After the
deadline it settles an open group using existing minimum-member rules. Failed
groups release reservations and create no orders. Confirmed members transfer
one existing reservation into one simulated owned order using the current
server group price. Availability/moderation and merchant approval are checked.
Prices are not guaranteed at invitation time. No client price is accepted.

The campaign row lock serializes checkout/retries and terminal transitions.
An account-scoped deterministic group key prevents duplicate orders; direct
checkout rejects the reserved group_ prefix. Transfer, audit and order insertion
commit atomically. Retrying returns the same order, including cancellation state.
Cancellation releases stock once through the existing owned-order endpoint.
Group orders use the existing order details and dispute workflow. No separate
payment, refund execution or fulfilment integration is introduced.

Tests extend the guarded disposable PostgreSQL suite with concurrent checkout,
server pricing, membership denial, payload tampering, replay and stock assertions.
Social unit tests cover role restrictions, mutation quotas, validation and the
reservation transfer. Do not claim PostgreSQL success if the workspace denies
loopback connections. Flutter runtime/widget tests and full accessibility
verification are still outstanding; this milestone is not marked verified.

## IMK-008 continuation evidence (2026-10-21)

The authenticated Next.js merchant workspace now creates groups for its own
published products with bounded minimum, capacity and duration inputs. Buyers
join and check out on web or Flutter. Flutter preserves checkout status during
catalog refresh, announces it near the group controls, displays fractional NGN
amounts correctly and limits cart additions to displayed stock. The server is
still authoritative when displayed stock changes.

Acceptance evidence:

| Requirement | Evidence | Verification status |
|---|---|---|
| Authentication and tenant isolation | Global guard; merchant-scoped creation; HTTP social journey rejects anonymous, buyer creation and other-merchant creation | Unit checks pass; PostgreSQL execution blocked |
| Invitations and joining | Clipboard public IDs and invitation fields on both clients | Source implemented; device/browser interaction pending |
| Server pricing | Unknown price fields rejected; checkout reads locked product price | Unit checks pass; real database assertions pending |
| Stock and replay | Campaign lock, atomic join reservation, unique membership, reservation transfer, owned idempotent order | Unit checks pass; PostgreSQL concurrency assertions pending |
| Tracking and protection | Owned order details/history/cancellation and existing disputes; HTTP group-order dispute journey | Existing and social unit checks pass; database journey pending |
| Responsive accessibility | Web responsive CSS, labels and status; Flutter scrolling, wrapped actions and live status | Manual keyboard, screen-reader, large-text and narrow-device checks pending |
| Financial gates | Simulated responses only; production startup refused; no financial integrations added | Offline safety checks pass |

`npm run check:offline` passed. Final `npm run ci` compiled the API and Next.js
storefront and ran 53 tests: 52 passed, one failed, zero skipped. The failure
was `connect EPERM 127.0.0.1:55438` in the PostgreSQL suite. A disposable cluster
was initialized under `/tmp`, but PostgreSQL startup itself failed with
`could not create IPv4 socket ... Operation not permitted`. No database
assertions are claimed as executed. Full output is in
`/tmp/imarket-imk008-ci-final.log`; the structured report is in
`/tmp/imarket-validation-8HJVxh/report.json` (temporary workspace artifacts).

Flutter launcher checks failed because the SDK cache is read-only. Direct Dart
analysis reported `No issues found!`, but exited unsuccessfully while writing
its telemetry session in the read-only home directory. This is not a clean
Flutter validation run. A direct Flutter web JavaScript compiler attempt produced no result and was
interrupted; no Flutter compilation success is claimed. Device/browser and
widget testing remain unverified.

Next milestone: finish IMK-008 verification in a local environment permitting
loopback PostgreSQL/HTTP sockets and a writable Flutter SDK/telemetry cache.
Run the full CI without skips, compile Flutter and exercise the two-buyer
invitation-to-group-order-to-dispute flow on web and mobile. Keep IMK-004,
IMK-006 and IMK-007 release gates blocked; no release is authorized.

## Latest end-to-end completion attempt — 2026-10-21

Preserved the existing branch and implementation. Added authenticated mobile
cancellation/history coverage (16 mobile tests defined), debug-only Android
networking in the bootstrap script, and reproducible emulator/ADB instructions
in `apps/mobile/README.md`. Widget HTTP doubles validate client contracts;
they do not establish live API integration.

| Acceptance gate | Status | Evidence / remaining work |
|---|---|---|
| Functional Flutter shopping | BLOCKED | API-backed source; analysis passes. Widget runner cannot bind loopback; emulator journey pending. |
| Authenticated group creation/purchasing | BLOCKED | Merchant web creation and buyer web/mobile joining implemented; authorization unit tests pass. SQL/HTTP journey pending. |
| Secure invitations | BLOCKED | Public IDs convey no authority; buyer session required. Clipboard/device and live rejection verification pending. |
| Backend-only discounts | BLOCKED | Payload validation/server pricing unit tests pass; locked PostgreSQL price assertions pending. |
| Duplicate joins / stock overselling | BLOCKED | Locks, unique membership and concurrency tests present; PostgreSQL execution unavailable. |
| Simulated checkout / owned history | BLOCKED | API-backed clients and retry tests present; live two-buyer journey pending. |
| Buyer protection | BLOCKED | Group orders use existing owned dispute workflow; live SQL/HTTP journey pending. |
| Accessible web and mobile | BLOCKED | Labels/status/scrolling and responsive source present; keyboard, TalkBack and large-text device verification pending. |
| PostgreSQL and authorization tests | BLOCKED | 52 backend/domain tests pass; mandatory database test cannot execute. |
| No live payments, lending or deployment | PASS | Offline safety checks pass; simulated responses and production refusal preserved. No financial action or deployment performed. |
| Reproducible Android instructions | PASS | Provisioning, debug manifest, ADB forwarding and acceptance journey documented; bootstrap fixture passes twice. Emulator execution pending. |

Verification evidence:

- `npm run check:offline`: PASS, structural/safety checks and both domain test files.
- `npm run ci`: FAIL (exit 1). API and Next.js builds PASS; 53 tests,
  52 passed, zero failed, one skipped. Required database URL unset; strict
  gate correctly refuses success. Report `/tmp/imarket-validation-2bAoO1/report.json`;
  full output `/tmp/imk008-ci.log`.
- Explicit guarded PostgreSQL target at loopback port 55439, disposable database
  name `imarket_test_imk008`: BLOCKED, `connect EPERM`; zero database assertions
  executed. `/tmp/imk008-postgres.log`. Independent server bind also denied.
- Flutter analysis with temporary writable SDK/HOME: PASS, exit 0, `No issues
  found!`; final mobile-scoped run `/tmp/imk008-flutter-analyze-final.log`.
  Direct Dart analysis also reports no issues.
- `flutter test`: BLOCKED (exit 1); both files fail to load because 127.0.0.1
  socket creation is denied; zero test bodies executed. `/tmp/imk008-flutter-test.log`.
  The subsequently added cancellation test also awaits runtime execution.
- Bootstrap fixture: PASS on initial and repeated runs. Existing attributes
  preserved, single Internet permission, cleartext confined to debug manifest.
  The fixture uses a stub Flutter generator; Android compilation is unverified.
  Shell syntax and final whitespace checks pass.

IMK-008 remains incomplete. Exact next milestone: run strict CI against a
separate disposable PostgreSQL database with zero skips; run all 16 Flutter
tests; build/run Android with ADB forwarding; exercise merchant creation and
the two-buyer invitation → join → deadline → checkout → history → dispute
journey on web/Android, including keyboard, TalkBack and large-text checks.
Correct runtime defects before closing the ticket. No commit, push, merge or
release performed. IMK-004, IMK-006 and IMK-007 remain blocked.

## Continuation — 2026-10-22

Preserved the existing feature branch and all earlier changes. Mobile order
history now displays the persisted API `total_kobo`, including fractional NGN,
and places cancellation/protection actions in a wrapping row below order text.
Repeated web product/group/order controls now have contextual accessible names.
Added controller regression tests for pending/unsuccessful settlement and replay
of cancelled group orders, plus a mobile large-text owned-order journey. There
are now 17 Flutter tests defined; doubles are contract tests, not live integration.

Current acceptance gates (supersede earlier attempt counts):

| Acceptance gate | Status | Evidence / remaining work |
|---|---|---|
| Functional Flutter customer shopping | BLOCKED | API-backed source; widget/device execution still required. |
| Authenticated group purchasing and creation | BLOCKED | Guard/validation tests pass; PostgreSQL/HTTP merchant and two-buyer journey cannot execute. |
| Secure social invitations | BLOCKED | Public IDs grant no authority; session required; actual clipboard/device verification pending. |
| Backend-only discounts | BLOCKED | Controller validation/transfer/replay checks pass; actual locked SQL pricing assertions pending. |
| Duplicate joins and atomic stock | BLOCKED | Required PostgreSQL concurrency tests present; database socket denied. |
| Simulated checkout and owned history | BLOCKED | Server totals shown on both clients; controller tests pass; live journey pending. |
| Buyer protection | BLOCKED | Owned order/dispute endpoints connected; live database/device journey pending. |
| Accessible web/mobile interfaces | BLOCKED | Contextual web labels and mobile wrapping actions added; keyboard, TalkBack and 200% text checks pending. |
| PostgreSQL and authorization tests | BLOCKED | 54 backend/domain cases pass; mandatory database case unavailable. |
| No live payments, lending or deployment | PASS | Offline safety checks pass; no financial integrations or release actions performed. |
| Reproducible Android instructions | PASS | Existing bootstrap, debug-only networking and emulator/ADB procedure retained; execution blocked. |

`npm run ci` exits 1: offline checks, API build and Next.js build pass; 55
backend/domain tests total, 54 passed, zero failed, one skipped. The strict gate
refuses that skip. Report: `/tmp/imarket-validation-lWX0Mq/report.json`; output:
`/tmp/imk008-ci-final-current.log`. An explicit guarded database attempt fails
with `connect EPERM 127.0.0.1:55439`; zero database assertions executed
(`/tmp/imk008-postgres-final.log`). `adb devices` fails because its local
smartsocket listener is denied (`/tmp/imk008-adb.log`). Shell syntax and whitespace
checks pass. No browser/emulator accessibility success is claimed.

Exact next milestone: execute strict CI with a disposable `imarket_test_*`
PostgreSQL database and zero skips, run all 17 Flutter tests, build/run Android,
and verify the merchant creation → two authenticated invitation joins → deadline
→ simulated checkout → owned history → dispute flow on web and Android. Include
keyboard, TalkBack and 200% text checks; correct demonstrated defects before
marking IMK-008 verified. No commit, push, merge or deployment performed.

Flutter verification for this continuation: a temporary SDK wrapper and writable
HOME under `/tmp` allowed offline package resolution and clean `flutter analyze
--no-pub` (`No issues found!`, `/tmp/imk008-flutter-analysis-final.log`). Direct
`dart analyze lib test` also passes (`/tmp/imk008-dart-analysis.log`). The refreshed
package configuration fixes obsolete temporary SDK paths from the prior session;
no application dependency change was needed. `flutter test --no-pub` fails loading
both test files because its 127.0.0.1 server socket is denied; zero test bodies
execute (`/tmp/imk008-flutter-tests-final.log`). Thus static analysis passes but
all 17 runtime tests and Android compilation remain unverified.

## 2026-10-23 automated continuation

The current acceptance matrix and reproducible evidence are in
[IMK008_VERIFICATION.md](IMK008_VERIFICATION.md), superseding older run counts
above. API discovery now supports validated literal text/category and inclusive
kobo price filters; web/mobile send real API filter requests and show advisory
countdowns. Merchant group creation requires an approved, published owned listing.
Web cart quantities are editable; new controller, guarded SQL and deterministic
mobile regressions are included. Existing Gradle wrapper files are now visible
to Git for eventual human review/staging.

Final CI: 56 pass, 1 PostgreSQL EPERM failure, zero skips; API/web builds and
offline checks pass. Flutter analysis passes; runtime tests fail during loading
because loopback sockets are denied. APK build fails at Gradle download under
network restrictions after retrying with a writable cache. No emulator or device
was used or required. Both remain DEFERRED. IMK-008 is not verified; no release,
commit, push or merge occurred.
