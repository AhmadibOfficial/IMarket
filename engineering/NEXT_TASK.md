# IMK-005: Merchant management and buyer protection

Status: in progress — implementation extended; required verification blocked

## Acceptance criteria
- [ ] merchant onboarding review
- [ ] product moderation
- [ ] customer dispute workflow
- [ ] audit records
- [ ] accessible web/mobile experiences

## Engineering safety
Read AGENTS.md and docs/RELEASE_GATES.md. Work on a feature branch, add negative tests, run CI. No unapproved real payments or deployment.

## IMK-005 continuation status
Implementation includes local administrator MFA and review UI, merchant product editing/activity, transaction-bound order audit events, and Flutter buyer disputes/details. See docs/MERCHANT_PROTECTION.md and docs/VERIFICATION.md. Acceptance is not complete.

Exact next milestone: run `npm run ci` against the dedicated guarded loopback PostgreSQL test database in an environment permitting socket access, fix demonstrated integration/concurrency failures, and obtain zero failed/skipped required tests. Then complete browser/device accessibility verification and local MFA security review. Do not proceed to financial enablement, release or deployment. IMK-004 and IMK-006 remain blocked by their separate legal/provider gates.
