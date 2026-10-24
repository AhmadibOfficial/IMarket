# IMK-008: Cross-platform social shopping experience

Status: planned

## Acceptance criteria
- [ ] functional Flutter customer shopping
- [ ] authenticated group purchasing
- [ ] social group invitations
- [ ] server-authoritative discounts
- [ ] atomic stock reservations
- [ ] simulated checkout and order history
- [ ] buyer protection integration
- [ ] accessible web and mobile interfaces
- [ ] PostgreSQL and authorization tests
- [ ] no live payments, lending or deployment

## Engineering safety
Read AGENTS.md and docs/RELEASE_GATES.md. Work on a feature branch, add negative tests, run CI. No unapproved real payments or deployment.

## Continuation state (2026-10-21)
Implementation is present on feature/imk-008-agent-proposal; preserve all work.
See docs/SOCIAL_SHOPPING.md for functionality and acceptance evidence. Do not
mark this ticket verified: full CI has 52 passing tests and one PostgreSQL
infrastructure failure (loopback sockets denied), and Flutter device/browser
verification remains pending. Next milestone is IMK-008 verification using
local PostgreSQL and a writable Flutter environment, with no skipped required
tests. No commit, push, merge, deployment or live financial action authorized.

Latest attempt: see the final acceptance matrix in docs/SOCIAL_SHOPPING.md.
API/web builds and 52 backend/domain tests pass; strict CI fails with the
required PostgreSQL case skipped. An explicit database run fails with loopback
EPERM. Flutter static analysis now passes with a writable temporary SDK/HOME;
widget execution remains socket-blocked (16 tests defined, zero runtime passes
claimed). Android debug networking and emulator instructions are prepared;
bootstrap fixture passes. Next milestone remains IMK-008 database, Flutter
runtime and web/Android accessibility verification. No release authorized.

2026-10-22 continuation: preserved prior changes; added mobile persisted order
pricing, wrapping order actions, contextual web accessible names, two backend
settlement/replay regressions and one large-text widget journey (17 mobile tests
now defined). Strict CI: 54 pass, zero fail, one required database skip; API/web
build and offline checks pass. Explicit PostgreSQL and ADB attempts are blocked
by socket EPERM. See latest SOCIAL_SHOPPING.md acceptance matrix. Ticket stays
planned; next milestone remains zero-skip database CI plus Flutter runtime and
web/Android accessibility verification. No commit, push, merge or release.
Flutter analysis and direct Dart analysis also pass after offline package
resolution with a temporary writable SDK/HOME. Flutter tests cannot load either
file due to denied 127.0.0.1 server sockets; zero runtime test passes claimed.

2026-10-23 current continuation: see docs/IMK008_VERIFICATION.md (authoritative
current acceptance matrix). Added API discovery filters and merchant group
eligibility enforcement, customer client filtering/countdowns, web cart quantity
editing, regression coverage and Gradle wrapper tracking fixes. Preserved branch,
staged changes, untracked work and Android scaffolding. Strict CI: 56 pass,
1 mandatory PostgreSQL EPERM failure, zero skips; API/web builds and offline
checks pass. Flutter analysis passes; all runtime test files cannot load due to
loopback EPERM. Debug APK build reaches Gradle but fails downloading under socket
restrictions with a writable cache. No new runtime or APK success claimed.
Next milestone: zero-skip guarded loopback database CI, all retained/new Flutter
tests, debug APK compilation and a synthetic local browser customer journey.
No emulator/device is required; emulator and physical-device acceptance remain
DEFERRED. Ticket remains planned, no commit/push/merge/deployment authorized.
