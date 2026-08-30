#!/usr/bin/env python3
"""
LinkFlow — live URL checker.
Verifies homepage/submit URLs with concurrent HTTP requests.
Classifies: alive (2xx/3xx), dead (4xx/5xx), timeout, dns-fail, ssl-fail.

Usage:
  python3 scripts/check-urls.py <file-with-urls.txt>   # one URL per line
  python3 scripts/check-urls.py --stdin               # read URLs from stdin
"""
import sys, os, re, json, socket, ssl
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

TIMEOUT = 8
THREADS = 24
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 LinkFlowBot/0.1'

def classify_url(url):
    """Return (status, kind, final_url, error) for one URL."""
    url = url.strip()
    if not url:
        return None
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            code = resp.getcode()
            final = resp.geturl()
            if 200 <= code < 300:
                return (url, 'alive', code, final, '')
            if 300 <= code < 400:
                return (url, 'alive', code, final, '')
            return (url, 'dead', code, final, '')
    except urllib.error.HTTPError as e:
        code = e.code
        # 308 = permanent redirect — follow manually (urllib doesn't auto-follow)
        if code == 308:
            loc = e.headers.get('Location', '')
            if loc:
                try:
                    target = urllib.request.urljoin(url, loc)
                    req2 = urllib.request.Request(target, headers={'User-Agent': USER_AGENT})
                    with urllib.request.urlopen(req2, timeout=TIMEOUT) as r2:
                        return (url, 'alive', r2.status, r2.geturl(), f'redirect→{target[:60]}')
                except Exception as e2:
                    return (url, 'alive', 308, url, f'308 redirect (target {loc[:40]} unreachable: {str(e2)[:40]})')
            return (url, 'alive', 308, url, '308 permanent redirect')
        # 403/429 often = bot-blocked, site likely alive
        if code in (403, 429):
            return (url, 'alive', code, url, f'bot-blocked ({code})')
        return (url, 'dead', code, url, f'HTTP {code}')
    except urllib.error.URLError as e:
        reason = getattr(e, 'reason', '')
        reason_s = str(reason)
        if isinstance(reason, socket.gaierror):
            return (url, 'dns-fail', 0, url, 'DNS resolution failed')
        if isinstance(reason, (ssl.SSLError, ssl.CertificateError)):
            return (url, 'alive', 0, url, f'SSL error (site up, cert issue): {reason_s[:60]}')
        if isinstance(reason, ConnectionRefusedError):
            return (url, 'dead', 0, url, 'connection refused')
        return (url, 'timeout', 0, url, f'{reason_s[:60]}')
    except socket.timeout:
        return (url, 'timeout', 0, url, 'timed out')
    except Exception as e:
        return (url, 'timeout', 0, url, f'{str(e)[:60]}')

def check_all(urls):
    results = []
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futs = {ex.submit(classify_url, u): u for u in urls if u.strip()}
        for fut in as_completed(futs):
            r = fut.result()
            if r:
                results.append(r)
    return results

def main():
    urls = []
    if '--stdin' in sys.argv:
        urls = [l.strip() for l in sys.stdin if l.strip()]
    else:
        path = sys.argv[1] if len(sys.argv) > 1 else None
        if not path:
            print('Usage: check-urls.py <file> | --stdin')
            sys.exit(1)
        urls = [l.strip() for l in open(path) if l.strip()]

    print(f'Checking {len(urls)} URLs with {THREADS} threads, {TIMEOUT}s timeout...')
    results = check_all(urls)
    results.sort(key=lambda r: r[0])

    alive = [r for r in results if r[1] == 'alive']
    dead = [r for r in results if r[1] in ('dead', 'dns-fail')]
    timeout = [r for r in results if r[1] == 'timeout']

    print(f'\n=== RESULTS: {len(alive)} alive, {len(dead)} dead, {len(timeout)} timeout ===\n')
    print('--- ALIVE ---')
    for url, kind, code, final, err in alive:
        print(f'  OK   {url}  (HTTP {code})' + (f'  → {final}' if final != url else ''))
    print('\n--- DEAD ---')
    for url, kind, code, final, err in dead:
        print(f'  DEAD {url}  ({err})')
    print(f'\n--- TIMEOUT (may be alive, retry) ---')
    for url, kind, code, final, err in timeout:
        print(f'  ?    {url}  ({err})')

    # JSON output for programmatic use
    with open('/tmp/linkflow-urlcheck.json', 'w') as f:
        json.dump({
            'alive': [r[0] for r in alive],
            'dead': [{'url': r[0], 'error': r[4]} for r in dead],
            'timeout': [{'url': r[0], 'error': r[4]} for r in timeout],
        }, f, indent=2)

if __name__ == '__main__':
    main()
