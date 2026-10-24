# IMK-008 mobile tests

Run from `apps/mobile`: `flutter pub get`, `flutter analyze`, `flutter test`.
All HTTP in widget tests uses `MockClient` through the existing injected client;
unexpected routes throw. No live server, payments or lending are used.

The suite defines 16 tests: 14 widget tests in `store_test.dart` (including two
parameterized invalid/expired invitation cases), plus two existing cart unit
tests. It exercises startup, inline catalog descriptions/prices, cart stock
limits and totals, authenticated invitations and joins, server-displayed group
prices and price-free checkout payloads, failed settlement, simulated checkout,
order detail dialog/history/logout, retry keys, dispute validation/submission,
authenticated cancellation and refreshed cancelled history,
loading/empty/error recovery, semantics and a 320px viewport at 1.5 text scale.
Fake responses test the client contract, not backend discount calculations,
stock concurrency, authorization enforcement or actual deadline settlement.

Missing mobile functionality: group creation (merchant web only), a dedicated
product detail route, and separate navigation destinations for cart/history/
protection. These currently appear inline or in dialogs. No passing tests are
claimed for absent features. Manual screen-reader/device testing remains needed.

Validation in the restricted workspace on 2026-10-21:
- Standard Flutter launcher cannot write SDK cache. A temporary launcher/cache
  under `/tmp/imarket-flutter` permits commands to start.
- `flutter pub get`: network/DNS failure contacting pub.dev; `--offline` succeeds.
- `flutter analyze`: telemetry write denied in the read-only home directory.
  Direct `dart --suppress-analytics analyze apps/mobile` reports no issues.
- `flutter test`: 0 test bodies executed, 0 passed; both test files fail to load
  because the runner cannot bind 127.0.0.1 (EPERM). Tests remain unverified.
- `npm run check:offline`: passes, 2 domain tests passed.
- `npm run ci`: API/web builds pass; backend tests 53 total, 52 passed, 0 failed,
  1 skipped because IMARKET_TEST_DATABASE_URL is unset. Required-test gate fails.

Next milestone: run all 15 mobile tests in an environment allowing Flutter's
loopback test runner and writable SDK/telemetry, fix any runtime failures, run CI
against isolated PostgreSQL without skips, then perform device accessibility
verification. No milestone approval or release status is changed.

## 2026-10-23 continuation

The current suite retains the existing cases and adds encoded API catalog
filtering and an injected-clock countdown regression. Countdown fixtures use UTC
and never authorize checkout locally. No emulator or device is required.
Current analysis, runtime, APK and database evidence is recorded in
[IMK008_VERIFICATION.md](../../../docs/IMK008_VERIFICATION.md); earlier counts
and attempts above are historical. Runtime test loading is currently blocked by
the sandbox's denied loopback bind, so no new runtime passes are claimed.
