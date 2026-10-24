# IMK-009: Merchant fulfillment and customer order intelligence

Status: implementation in progress; runtime verification blocked

Current evidence: [IMK-009 verification](../docs/IMK009_VERIFICATION.md).
Latest serial CI: 63 passing tests, one PostgreSQL EPERM connection failure,
zero skips; API and Next.js builds and Flutter analysis pass. Fulfillment now
rejects inherited property names before acquiring a database connection.
Next: run strict CI on the isolated PostgreSQL target, all Flutter tests, the
debug APK build and synthetic browser journeys with local sockets available.
No emulator or device testing is required for this continuation.

## Acceptance criteria
- [ ] merchant-owned simulated fulfillment workflow
- [ ] server-enforced order state transitions
- [ ] customer order timeline in Flutter and web
- [ ] private in-app notifications
- [ ] order and dispute audit integration
- [ ] cross-tenant and ownership negative tests
- [ ] idempotent fulfillment operations
- [ ] PostgreSQL concurrency tests
- [ ] Flutter and web automated verification
- [ ] no real payments, shipping or deployment

## Engineering safety
Read AGENTS.md and docs/RELEASE_GATES.md. Work on a feature branch, add negative tests, run CI. No unapproved real payments or deployment.
