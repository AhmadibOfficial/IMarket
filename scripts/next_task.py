#!/usr/bin/env python3
"""Offline work item assembler. Does not claim to generate implementation code."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
items = json.loads((root / 'engineering/backlog.json').read_text())
item = next((t for t in items if t['status'] == 'planned'), None)
if not item:
    raise SystemExit('No unlocked planned tickets remain. Review backlog and release gates.')
content = f"# {item['id']}: {item['title']}\n\nStatus: {item['status']}\n\n## Acceptance criteria\n" + ''.join(f"- [ ] {x}\n" for x in item['acceptance']) + "\n## Engineering safety\nRead AGENTS.md and docs/RELEASE_GATES.md. Work on a feature branch, add negative tests, run CI. No unapproved real payments or deployment.\n"
out = root / 'engineering/NEXT_TASK.md'
out.write_text(content)
print(f'Created {out.relative_to(root)} — coding-agent-ready implementation brief, not an implementation.')
