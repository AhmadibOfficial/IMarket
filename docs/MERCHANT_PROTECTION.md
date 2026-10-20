# IMK-005 merchant management and buyer protection

Local synthetic implementation only. Real identity/seller access, payments, refunds, financing, external services and production remain disabled by `RELEASE_GATES.md`. No application database migration or release was performed. Continue on `feature/imk-005-agent-proposal` without committing.

## Implemented behavior

- Merchant applications: provisioned merchant accounts begin pending and may submit/resubmit pending/rejected applications. Administrators approve, reject or suspend accounts. Every mutation derives ownership from the authenticated principal and writes an audit event in its transaction.
- Moderation: merchant drafts and edits are unpublished/pending; edits invalidate previous approval. Merchants submit or withdraw owned products. Only administrator review publishes products, and only for approved merchants. Public catalog/group reads and inventory reservations enforce moderation and merchant approval. Merchant row locks serialize suspension against reservations and publication; product locks protect inventory and edits.
- Protection: buyer-owned order details and dispute creation; one dispute per order serialized on its order row. States are open → responded → resolved/rejected, or open → resolved/rejected. Merchants can respond once to their own open disputes; only administrators resolve/reject. Decisions and evidence persist. Refund requests are boolean records with no financial execution.
- Evidence: bounded text only, rendered as text. Attachments, extra fields, objects and control characters are rejected; no URL fetching or file storage occurs. Do not submit personal information or actual customer records.
- Dashboard: application state/submission, owned product creation/editing/submission/withdrawal, bounded stock additions, owned order fulfillment, dispute responses and tenant-scoped activity counts.
- Customer web: shopping/cart, account login/logout, order history/details, cancellation, dispute submission/tracking. Responsive layouts, explicit form labels, keyboard focus and status announcements are present.
- Administrator web: password + TOTP login, application decisions, product moderation, dispute resolution and recent audit events. Sessions remain in memory and expire after five minutes.
- Flutter: buyer shopping/account flow, order details, cancellation and dispute submission/tracking, including merchant responses and administrator resolution. Merchant/admin mobile workflows remain web-only.
- Audit: merchant applications/reviews, product creation/edit/submission/review/withdrawal, stock additions, order creation/cancellation/fulfillment, disputes, and local administrator enrollment/login. Audit inserts share transactions with mutations. Audit payloads contain actor/action/subject/time, never credentials or dispute text. No audit mutation API exists.

## Local administrator MFA

Migration 006 adds encrypted TOTP enrollment and MFA-stamped sessions. Enrollment occurs only through the operator's existing local account CLI, never a public endpoint. See `AUTHENTICATION.md`. There is no password-only administrator path. TOTP seeds use AES-256-GCM bound to the account ID, with a separately supplied operator key. Six-digit SHA-1 TOTP uses 30-second steps and ±one-step drift. A locked, monotonically consumed counter rejects replay, including concurrent logins. Session creation, counter consumption and audit are atomic. Missing enrollment/key, tampered ciphertext and invalid codes deny login. Sessions require current enrollment and recent MFA; old buyer sessions cannot become administrator sessions through role changes.

This is a synthetic local implementation, not a reviewed production MFA rollout. Human enrollment/recovery review, phishing-resistant authenticators, key rotation/retention and security review remain release requirements.

## Acceptance evidence and remaining work

| Criterion | Implementation | Acceptance |
|---|---|---|
| Merchant onboarding and isolation | API + merchant/admin web | Pending PostgreSQL/HTTP verification |
| Product moderation | Ownership, review and checkout enforcement; editing resets approval | Pending PostgreSQL/concurrency verification |
| Disputes and refund-request records | Buyer/merchant/admin workflows and text evidence | Pending PostgreSQL/HTTP verification |
| Audit records | Transaction-bound core mutations | Pending PostgreSQL rollback/persistence verification |
| Accessible web/mobile experiences | Responsive labeled web flows; Flutter buyer integration | Builds/static analysis pass; browser/device accessibility review outstanding |
| Automated validation | Domain/API negative tests, required isolated SQL + HTTP suite | CI blocked by PostgreSQL EPERM; zero skips, no guards weakened |

The PostgreSQL suite includes migration reruns, real Nest guards/sessions, local administrator MFA login/replay races, wrong-role/tenant denial, product edit withdrawal, audit failure rollback, duplicate dispute contention, response/resolution finality, suspension and inventory contention. Its initial connection fails in this sandbox, so none of its SQL/HTTP assertions is claimed verified. See `VERIFICATION.md` for exact results.

Known limits: text evidence only; recent lists capped at 100 without pagination; no browser/device testing; no Flutter merchant/admin screens; no MFA recovery API or automatic enrollment; audit retention and database-role immutability require review; no background group-expiry scheduler or real delivery integration. IMK-005 remains incomplete until required database/HTTP tests and experience checks pass. Next milestone: run the guarded isolated PostgreSQL suite in a permitted local environment, fix any demonstrated failures, obtain zero-failure/zero-skip CI, then verify browser/device accessibility. IMK-004 and financial/production gates remain blocked.
