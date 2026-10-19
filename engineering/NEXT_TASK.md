# IMK-003: Verified inventory and order lifecycle

Status: planned

## Acceptance criteria
- [ ] atomic inventory reservations
- [ ] idempotent order creation
- [ ] group expiry and cancellation transitions
- [ ] concurrency tests with PostgreSQL
- [ ] no real financial capture

## Engineering safety
Read AGENTS.md and docs/RELEASE_GATES.md. Work on a feature branch, add negative tests, run CI. No unapproved real payments or deployment.
