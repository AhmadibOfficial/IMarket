# Release safety gates

| Capability | Default | Enable only after |
|---|---|---|
| Local sample catalog | Demo enabled | All tests run |
| Group join simulation | Demo enabled | Race and expiration tests |
| Real authentication and seller access | Disabled | OAuth/session, MFA for admins, tenancy and abuse review |
| Real money payment/capture/refunds | Disabled | Contracted regulated processor, signatures, idempotency, PCI scope and reconciliation |
| Customer prepayments | Disabled | Nigerian legal review, provider custody arrangements and consumer disclosures |
| Early product delivery/consumer finance | Disabled | Licensed partnership where required, affordability/default governance and legal signoff |
| Production deployment | Disabled | Threat model, privacy, secrets, audit, rate limits, incident plan, accessibility and owner authorization |

Every financial or identity feature MUST require human review. Do not auto-merge or deploy financial changes. Test data must use synthetic aliases, never real customer identity records.
