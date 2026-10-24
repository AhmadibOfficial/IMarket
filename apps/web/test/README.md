# IMK-009 synthetic browser UI journeys

Run `npm run test:browser` from the repository root with Node 22+, installed npm
dependencies, Chromium (`CHROMIUM_BIN` may override its path), and local sockets
permitted. No emulator, device or external service is used.

The command builds API/Next.js, fixing the browser API URL to loopback, then runs
`scripts/test-browser.cjs` with a synthetic HTTP fixture on 127.0.0.1:4000 and
Next.js on 127.0.0.1:3109. Both ports must be free; existing services are never
terminated. A temporary Chromium profile is removed on completion. Do not point
this runner at a live API. Normal Chromium sandbox requirements apply.

It clicks through merchant login and all three simulated fulfillment steps,
buyer login and owned tracking, notification loading/read/error recovery/empty
states, logout clearing, and overflow checks at 1280, 768 and 360 pixels.
Fixtures have no real accounts or customer data. The fixture deliberately does
not implement authorization, transactions or persistence: UI contract checks
cannot establish backend security or concurrency correctness.

Separately run `npm run ci` with `IMARKET_TEST_DATABASE_URL` set to a disposable
loopback `imarket_test_*` database. Its mandatory PostgreSQL suite creates a
private schema, applies migrations including 007, runs real authenticated HTTP
security/ownership, fulfillment retry, rollback and synchronization assertions,
and removes the schema. Zero failures and zero skips are required. Backend plus
UI fixture checks still do not replace a fully integrated browser/database or
manual screen-reader review; those remain explicit evidence gaps.

Current results and limits are in [IMK-009 verification](../../../docs/IMK009_VERIFICATION.md).
