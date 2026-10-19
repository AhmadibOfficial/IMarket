# IMK-002: Authentication and merchant tenant isolation

Status: planned

## Acceptance criteria
- [ ] add login with short-lived sessions and secure credential storage
- [ ] enforce RBAC in API for all mutable endpoints
- [ ] negative tenant access tests
- [ ] server-side input validation
- [ ] administrator MFA and rate limit design

## Engineering safety
Read AGENTS.md and docs/RELEASE_GATES.md. Work on a feature branch, add negative tests, run CI. No unapproved real payments or deployment.
