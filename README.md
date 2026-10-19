# IMarket — social shopping and flexible commerce

**IMK-001 automated development starter** — an original Nigeria-first marketplace concept combining social group buying and future structured installment shopping. This repository is a **development-only scaffold**, not a production app and not a live financing service.

## Included now

- **Web customer storefront:** Next.js responsive catalog, displayed full/group prices, group campaign demos, and demo checkout UI.
- **API:** NestJS read catalog, create and join demo group campaigns, simulated no-money checkout, and health endpoint.
- **Database:** PostgreSQL schema with constraints, unique group membership and row-locking for concurrent joins.
- **Flutter source:** Android/iOS UI consuming the same demo catalog API. Platform folders are generated locally with Flutter SDK.
- **Automation:** one-command checks, GitHub Actions test/build jobs, offline work-item planner, and optional sandboxed Codex CLI agent execution for one future ticket at a time.
- **Security:** localhost-only API, production startup refusal, no real payments, no credit, no PII-based identities, no secrets.

## Fast start on Kali Linux

Requirements: **Node.js >=22**, **Python 3**, **Docker Compose**, npm; **Flutter** for Android/iOS builds. Requires internet to download official npm packages and Flutter dependencies on first install. No cloud subscription required for local development.

```bash
unzip IMarket-IMK001.zip && cd IMarket
chmod +x scripts/*.sh
./scripts/autobuild.sh doctor
./scripts/autobuild.sh setup
./scripts/autobuild.sh start-api
# In another terminal:
./scripts/autobuild.sh start-web
# Open http://localhost:3000
```

If you prefer manual control: `docker compose up -d postgres`, `npm install`, `npm run db:migrate`, `npm run dev:api`, and `npm run dev:web` in separate terminals.

The Postgres development user/password in `.env.example` and compose.yaml are **local-only sample credentials**; never reuse them in any deployment. No password is needed for the demo shopper because **real account authentication is not implemented**.

### Flutter

```bash
./scripts/bootstrap_mobile.sh
cd apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2:4000
```

`10.0.2.2` maps to host loopback on a standard Android emulator. A physical Android device needs a safe reachable dev address and configured development networking; the API defaults to loopback for safety. iOS compilation requires macOS/Xcode.

## Safe build workflow

1. Each change triggers GitHub Actions on a PR or push: offline structure/policy checks, domain unit tests, TypeScript/Next build checks.
2. A spec is generated from `engineering/backlog.json` with `npm run next-task`. This is **a coding-agent-ready work item, not an AI-generated implementation**.
3. An authorized coding agent/developer implements one ticket on a feature branch. PR review and successful CI are required before merge.
4. Payment, credit, KYC, production and external integrations stay blocked until legal/security/operational requirements are met.
5. No pipeline auto-deploys, auto-merges or purchases cloud resources.

To create a branch-ready milestone description without an AI dependency:
```bash
npm run next-task
```

### Optional source-authoring autopilot (operator initiated)

Install and authenticate the official Codex CLI on your own workstation. Its `codex exec --sandbox workspace-write` interface supports non-interactive edits in a restricted workspace (check current CLI docs). **This project does not bundle a model or grant subscription rights.**

```bash
git init && git add . && git commit -m "chore: IMK-001 initial scaffold"
./scripts/agent_build.sh
# Inspect the proposed source changes and test results. Nothing is auto-pushed.
```

The script refuses dirty worktrees, creates a task-specific feature branch, passes the next planned milestone to a workspace-write agent, runs offline tests and a local build when dependencies are installed. It **does not** commit, publish, open PRs, merge, deploy, touch cloud resources, or implement finance integrations without a separately approved workflow. This is controlled automation, not a claim that future tickets have already been built. Use your own repo and review output carefully before pushing.

## Representative API

- `GET /health`
- `GET /api/products`
- `GET /api/groups`
- `POST /api/groups` `{ "productId": "...", "minMembers": 2, "maxMembers": 5, "durationHours": 24 }`
- `POST /api/groups/:id/join` `{ "demoAlias": "tester01" }`
- `POST /api/demo-checkout` `{ "productId": "...", "quantity": 1 }` (no money is collected; returns `SIMULATED_ONLY`)

**All APIs are local demo APIs without user authentication and must not be internet exposed**. User accounts, real payments, card handling, finance, payout and shipping are **not implemented**. Group deals do not reserve stock, capture funds or guarantee delivery.

## Delivery phases

- IMK-001: engineering foundation + demo marketplace and group engine (this starter)
- IMK-002: production-grade authentication, merchant identity, roles and tenancy
- IMK-003: inventory reservation and order state machine + idempotency
- IMK-004: approved payment-provider sandbox + verified webhook reconciliation
- IMK-005: merchant portal and buyer protection testing
- IMK-006: structured prepayment design, financial/legal review (still no early-delivery finance)
- IMK-007: first private pilot launch gate

See `docs/PRODUCT.md`, `docs/RELEASE_GATES.md`, `AGENTS.md`, and `engineering/backlog.json`.
