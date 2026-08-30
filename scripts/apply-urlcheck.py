#!/usr/bin/env python3
"""
LinkFlow — apply URL verification results to the DB.
Reads /tmp/linkflow-urlcheck.json + /tmp/linkflow-dnsdead.txt and marks
dead entries with status: dead (plus a note explaining why).

Usage:
  python3 scripts/apply-urlcheck.py          # mark dead entries
  python3 scripts/apply-urlcheck.py --dry    # show what would change
"""
import os, sys, json, yaml

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'directories.yaml')
CHECK = '/tmp/linkflow-urlcheck.json'
DNSDEAD = '/tmp/linkflow-dnsdead.txt'

DRY = '--dry' in sys.argv

# Errors that mean "site is gone / path is dead"
DEAD_ERRORS = ('HTTP 404', 'HTTP 410', 'DNS resolution failed', 'connection refused')
# Server-side errors — site likely alive but having issues (flag, don't kill)
SOFT_ERRORS = ('HTTP 402', 'HTTP 500', 'HTTP 502', 'HTTP 526', 'HTTP 406')

def main():
    if not os.path.exists(CHECK):
        print('check-urls output not found — run check-urls.py first.')
        sys.exit(1)

    check = json.load(open(CHECK))
    dead_by_url = {}
    for e in check['dead']:
        dead_by_url[e['url']] = e['error']

    dns_dead = set()
    if os.path.exists(DNSDEAD):
        dns_dead = {l.strip() for l in open(DNSDEAD) if l.strip()}

    data = yaml.safe_load(open(DB))
    marked = 0
    soft = 0
    for cat, entries in data.items():
        for e in entries:
            url = e.get('submitUrl', '')
            if url in dead_by_url:
                err = dead_by_url[url]
                if err in DEAD_ERRORS or url in dns_dead:
                    if e.get('status') != 'dead':
                        e['status'] = 'dead'
                        e['notes'] = (e.get('notes', '') + f' [verified dead: {err}]').strip()
                        marked += 1
                elif err in SOFT_ERRORS:
                    e['notes'] = (e.get('notes', '') + f' [server error: {err} — verify]').strip()
                    soft += 1

    if DRY:
        print(f'DRY RUN: would mark {marked} dead, {soft} soft-flagged')
    else:
        with open(DB, 'w') as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True, default_flow_style=False)
        print(f'Marked {marked} entries dead, soft-flagged {soft}')

    # stats
    dead_count = sum(1 for ents in data.values() for e in ents if e.get('status') == 'dead')
    print(f'DB now has {dead_count} entries with status=dead')

if __name__ == '__main__':
    main()
