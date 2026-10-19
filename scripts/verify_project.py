#!/usr/bin/env python3
"""Offline deterministic structural and safety checks."""
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
required = [
    'AGENTS.md', 'README.md', 'docs/PRODUCT.md', 'docs/RELEASE_GATES.md',
    '.github/workflows/build.yml', 'apps/api/src/main.ts', 'apps/api/src/api.controller.ts',
    'apps/api/migrations/001_init.sql', 'apps/web/app/page.tsx', 'apps/mobile/lib/main.dart',
    'packages/commerce-domain/index.cjs', 'engineering/backlog.json', 'scripts/autobuild.sh', 'scripts/agent_build.sh'
]
for file in required:
    assert (root / file).is_file(), f'Missing: {file}'
backlog = json.loads((root / 'engineering/backlog.json').read_text())
assert len(backlog) >= 5 and len({i['id'] for i in backlog}) == len(backlog)
assert backlog[0]['id'] == 'IMK-001'
api = (root / 'apps/api/src/main.ts').read_text()
assert 'NODE_ENV' in api and 'production' in api and 'APP_DEMO_MODE' in api
assert '127.0.0.1' in api, 'API must default to loopback'
workflow = (root / '.github/workflows/build.yml').read_text()
assert 'npm run check:offline' in workflow and 'npm run build' in workflow
assert '\n  deploy:' not in workflow.lower() and 'deployment:' not in workflow.lower(), 'Unexpected deployment job in CI'
migrations = (root / 'apps/api/migrations/001_init.sql').read_text()
assert 'UNIQUE (campaign_id, demo_alias)' in migrations
assert 'CHECK (group_price_kobo <= price_kobo)' in migrations
agent = (root / 'scripts/agent_build.sh').read_text()
assert '--sandbox workspace-write' in agent and 'git switch -c' in agent
assert 'git push ' not in agent and 'gh pr merge' not in agent
for p in root.rglob('*'):
    if p.is_file() and p.name in ('.env', 'id_rsa'):
        raise AssertionError(f'Secret-like file included: {p}')
print(f'IMarket structural + safety gates passed ({len(required)} required files, {len(backlog)} milestones).')
