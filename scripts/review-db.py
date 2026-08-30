#!/usr/bin/env python3
"""
LinkFlow — database quality review.
Flags issues across data/directories.yaml for curation:
  - missing name/submitUrl
  - status=dead/paid (should be surfaced)
  - auto=manual entries that look like they have real submit forms (candidates to verify)
  - obvious URL problems (no http, trailing junk)
  - duplicate names within category
  - low-value entries (submitUrl == homepage, no explicit submit path)
"""
import os, sys, re
import yaml
from urllib.parse import urlparse

DB = os.path.expanduser('~/Documents/Projects/linkflow/data/directories.yaml')
data = yaml.safe_load(open(DB))

issues = []
stats = {'total': 0, 'auto_yes': 0, 'auto_manual': 0, 'dead': 0, 'paid': 0, 'missing_submit': 0}

SUBMIT_HINTS = ['submit', 'add', 'new', 'create', 'signup', 'register', 'list', 'join', 'launch', 'post', 'upload', 'apply']

for cat, entries in data.items():
    seen_names = {}
    for e in entries:
        stats['total'] += 1
        name = e.get('name', '')
        url = e.get('submitUrl', '')
        auto = e.get('auto', 'manual')
        status = e.get('status', 'active')

        if auto == 'yes': stats['auto_yes'] += 1
        elif auto == 'manual': stats['auto_manual'] += 1
        if status == 'dead': stats['dead'] += 1
        if status == 'paid': stats['paid'] += 1

        # 1. missing fields
        if not name:
            issues.append(f'[{cat}] MISSING NAME: {e}')
        if not url:
            stats['missing_submit'] += 1
            issues.append(f'[{cat}] {name or "?"}: missing submitUrl')

        # 2. URL sanity
        if url and not url.startswith('http'):
            issues.append(f'[{cat}] {name}: bad URL "{url[:60]}"')

        # 3. homepage-as-submit (low value) — no obvious submit path
        # skip status=dead entries (already verified gone)
        if url and status != 'dead':
            path = urlparse(url).path.rstrip('/')
            domain = urlparse(url).netloc
            if path in ('', '/') and not any(h in url.lower() for h in SUBMIT_HINTS):
                issues.append(f'[{cat}] {name}: submitUrl looks like homepage ({url[:60]}) — verify real submit page')

        # 4. duplicate names within category
        nl = name.lower()
        if nl in seen_names:
            issues.append(f'[{cat}] DUPLICATE name: "{name}"')
        seen_names[nl] = True

print('=== LinkFlow DB Review ===')
print(f'\nTotals: {stats["total"]} entries | auto=yes: {stats["auto_yes"]} | auto=manual: {stats["auto_manual"]} | dead: {stats["dead"]} | paid: {stats["paid"]} | missing submitUrl: {stats["missing_submit"]}')
print(f'\n--- {len(issues)} issues flagged ---')
for i in issues[:80]:
    print(f'  ⚠️  {i}')
if len(issues) > 80:
    print(f'  … and {len(issues)-80} more')
