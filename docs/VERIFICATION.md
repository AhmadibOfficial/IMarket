# IMK-001 verification evidence — 2026-10-19

## Passed in artifact-generation environment
- `npm run check:offline`: PASS
- Structural and policy validator (`scripts/verify_project.py`): PASS
- 16 domain unit tests (`node --test ...`): 16 PASS, 0 FAIL
- `bash -n scripts/*.sh`: PASS
- Offline task planner: generated `engineering/NEXT_TASK.md`

## Not verifiable in this environment
- `npm install`: timed out; no complete node_modules tree downloaded. Consequently full Next.js and NestJS compilation/build not run here.
- Docker Compose and local PostgreSQL runtime: Docker not installed; migrations and REST handlers not exercised live.
- Flutter SDK/Android emulator/macOS: not installed; Flutter compile and device tests not run.
- Codex coding-agent runner: not invoked; script integration must be verified on an authenticated workstation.
- GitHub Actions: workflow is authored but not executed in GitHub, as there is no existing IMarket repository under the linked GitHub account.

## Claims carefully limited
This is a tested **offline development starter**, not a complete working deployment or production-ready e-commerce application. Before opening access to real customers, implement proper identity, permissions, payment legal compliance, threat model and operation reviews.
