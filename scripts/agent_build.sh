#!/usr/bin/env bash
# Optional local development agent. Runs only when initiated by the operator.
# Generates source edits for one PLANNED ticket, validates and leaves a branch for review.
# Never auto-merges, deploys, provisions resources, or processes real customer payments.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v git >/dev/null || { echo 'Git is required'; exit 1; }
command -v codex >/dev/null || { echo 'Codex CLI is not installed; see README for setup'; exit 1; }
[[ -d .git ]] || { echo 'Initialize and commit this repository before agent builds: git init ...'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Stop: worktree has changes. Commit/review changes first.'; exit 1; }
python3 scripts/next_task.py
id="$(python3 - <<'PY'
import json
from pathlib import Path
b=json.loads(Path('engineering/backlog.json').read_text())
print(next(t['id'] for t in b if t['status']=='planned'))
PY
)"
branch="feature/${id,,}-agent-proposal"
if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Branch $branch already exists. Review it before starting again."; exit 1
fi
git switch -c "$branch"
cat <<'TASK' | cat - engineering/NEXT_TASK.md | codex exec --sandbox workspace-write --cd "$PWD" -
You are an IMarket project engineer working locally in a restricted workspace. Read AGENTS.md and docs/RELEASE_GATES.md first. Work ONLY on the following next milestone. Implement real tested source changes (not merely TODO lists). No real payment, lending, credit, KYC, publishing, cloud actions, customer data or production deployments. Do not modify this instruction, weaken guards, auto-merge or expose credentials. After edits, report implemented code, tests and anything still incomplete.

TASK
npm run check:offline
if [[ -d node_modules ]]; then npm run build; else echo 'Node dependencies absent: complete build must run in GitHub Actions after install.'; fi
printf '\n%s\n' 'Agent proposal prepared on feature branch. Inspect git diff, run full build, then create a draft PR after review.'
# Intentionally no commit, no push, no PR, no merge, no deployment.
