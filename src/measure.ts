/**
 * BacklinkFlow v0.4 — backlink measurement (free sources only).
 *
 * Strategy (mirrors seoflow's lib/backlinks/backlinks.ts, free path):
 *  1. Common Crawl web graph via seoflow's python/commoncrawl_graph.py when
 *     the seoflow checkout exists next to this repo (domain-level PageRank,
 *     harmonic centrality, crawl presence). No API key, public data.
 *  2. OpenLinkProfiles.org API fallback (free, no key) — returns a real
 *     backlink count for the domain.
 *  3. Explicit scaffold hook: if a seoflow BacklinkAnalyzer is importable
 *     from node_modules, delegate to it (returns mock data when unavailable).
 *
 * Bing Webmaster / Moz are paid or keyed — deliberately NOT wired up.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BacklinkMetrics {
  url: string;
  domain: string;
  source: string;
  measuredAt: string;
  totalBacklinks?: number | null;
  referringDomains?: number | null;
  /** pages of the domain captured in the latest Common Crawl crawl (CDX) */
  pagesInIndex?: number | null;
  pagerank?: number | null;
  harmonicCentrality?: number | null;
  inCommonCrawl?: boolean;
  note?: string;
  /** true when every real source failed and numbers are null */
  unavailable: boolean;
}

export function toDomain(url: string): string {
  const host = url.replace(/^[a-z]+:\/\//i, '').replace(/^\/\//, '').split(/[/?#]/)[0].split('@').pop() || '';
  return host.replace(/^www\./, '').toLowerCase();
}

/** Locate seoflow's commoncrawl_graph.py (sibling checkout, not modified). */
export function findCommonCrawlScript(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', 'seoflow', 'python', 'commoncrawl_graph.py'),
    path.join(__dirname, '..', '..', '..', 'seoflow', 'python', 'commoncrawl_graph.py'),
    path.join(process.cwd(), '..', 'seoflow', 'python', 'commoncrawl_graph.py'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Run seoflow's Common Crawl script (domain-level metrics, free, no key). */
export async function measureViaCommonCrawl(domain: string): Promise<Partial<BacklinkMetrics>> {
  const script = findCommonCrawlScript();
  if (!script) return { unavailable: true, note: 'seoflow python/commoncrawl_graph.py not found (sibling checkout)' };
  try {
    const out = execFileSync('python3', [script, domain, '--json'], {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });
    // script pretty-prints JSON (indent=2); urllib3 warnings land on stderr.
    // Find the first `{` and parse from there to the end.
    const start = out.indexOf('{');
    const data = start === -1 ? null : JSON.parse(out.slice(start));
    if (data.status !== 'success' || !data.data) {
      return { unavailable: true, note: data.error || 'commoncrawl lookup failed' };
    }
    const d = data.data;
    return {
      source: 'commoncrawl',
      inCommonCrawl: Boolean(d.in_crawl),
      pagerank: d.pagerank ?? null,
      harmonicCentrality: d.harmonic_centrality ?? null,
      note: d.note || undefined,
      unavailable: false,
    };
  } catch (err) {
    return { unavailable: true, note: `commoncrawl failed: ${(err as Error).message.slice(0, 120)}` };
  }
}

/** OpenLinkProfiles free API — real backlink count, no key. */
export async function measureViaOpenLinkProfiles(domain: string): Promise<Partial<BacklinkMetrics>> {
  const url = `https://openlinkprofiles.org/api/free/${encodeURIComponent(domain)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 BacklinkFlow/0.4' } });
    if (!res.ok) return { unavailable: true, note: `openlinkprofiles HTTP ${res.status}` };
    const data: any = await res.json();
    const total = data?.total_backlinks ?? data?.backlinks ?? data?.total ?? null;
    const refs = data?.referring_domains ?? data?.domains ?? null;
    return {
      source: 'openlinkprofiles',
      totalBacklinks: typeof total === 'number' ? total : total != null ? Number(total) : null,
      referringDomains: typeof refs === 'number' ? refs : refs != null ? Number(refs) : null,
      note: data?.note || (total == null && refs == null ? 'API returned no numeric fields' : undefined),
      unavailable: total == null && refs == null,
    };
  } catch (err) {
    return { unavailable: true, note: `openlinkprofiles failed: ${(err as Error).message.slice(0, 120)}` };
  }
}

/** Scaffold: delegate to seoflow's BacklinkAnalyzer when importable. */
export async function measureViaSeoflow(domain: string): Promise<Partial<BacklinkMetrics> | null> {
  try {
    const mod = await import('seoflow/lib/backlinks/backlinks.js').catch(() => null);
    const analyzer = (mod as any)?.BacklinkAnalyzer;
    if (!analyzer) return null;
    const res = analyzer.analyze(`https://${domain}`, { includeBing: false, includeMoz: false, includeCommonCrawl: true, limit: 50 });
    return {
      source: 'seoflow',
      totalBacklinks: res?.totalBacklinks ?? null,
      referringDomains: res?.referringDomains ?? null,
      note: res?.isMock ? 'seoflow returned mock data (analyzer unavailable)' : undefined,
      unavailable: Boolean(res?.isMock) || res == null,
    };
  } catch {
    return null;
  }
}

const CDX_API = 'https://index.commoncrawl.org';

/** Try a handful of recent collections — newer crawls may not have the domain yet. */
const CDX_COLLECTIONS = ['CC-MAIN-2026-34', 'CC-MAIN-2026-30', 'CC-MAIN-2026-25', 'CC-MAIN-2026-21', 'CC-MAIN-2026-17', 'CC-MAIN-2025-51'];

/**
 * IndexNow CDX backlink scan — real counts from Common Crawl's index (free, no key).
 * Query 1: pages of the domain (url=domain,star). Query 2: pages linking TO it
 * (url=star,star//domain,star, excluding the domain's own pages).
 */
export async function measureViaCdx(domain: string): Promise<Partial<BacklinkMetrics>> {
  for (const coll of CDX_COLLECTIONS) {
    const own = await cdxQuery(coll, `${domain}%2F*`, `url=${encodeURIComponent(domain)}%2F*`);
    const inbound = await cdxQuery(coll, `*%2F%2F${domain}%2F*`, `url=*%2F%2F${encodeURIComponent(domain)}%2F*`);
    if (own.unavailable && inbound.unavailable) continue; // try older crawl
    const linking = inbound.parsed.filter((r) => !(r.url || '').includes(domain));
    return {
      source: 'commoncrawl-cdx',
      pagesInIndex: own.parsed.length,
      totalBacklinks: linking.length,
      referringDomains: new Set(linking.map((r) => r.url.split('/')[2])).size,
      note: `captures for ${domain} in ${coll} (pages: ${own.parsed.length}, linking: ${linking.length})`,
      unavailable: false,
    };
  }
  return { unavailable: true, note: `no captures for ${domain} in any recent Common Crawl index (too new or never crawled)` };
}

async function cdxQuery(coll: string, encodedUrl: string, urlParam: string): Promise<{ parsed: any[]; unavailable: boolean }> {
  const api = `${CDX_API}/${coll}-index?${urlParam}&output=json&filter=status:200&collapse=urlkey`;
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'Mozilla/5.0 BacklinkFlow/0.4' } });
    const text = await res.text();
    // CDX answers 404 for "no captures" and "no such collection" alike — the
    // JSON body distinguishes them, so read it before checking the status code.
    if (res.status === 404 || /No index found|No Captures found/i.test(text)) return { parsed: [], unavailable: true };
    if (!res.ok) return { parsed: [], unavailable: true };
    const lines = text.split('\n').filter((l) => l.trim().startsWith('{'));
    return { parsed: lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean), unavailable: false };
  } catch {
    return { parsed: [], unavailable: true };
  }
}

/**
 * Measure backlinks for a site. Tries in order: seoflow analyzer scaffold,
 * Common Crawl web graph, Common Crawl CDX index, OpenLinkProfiles API.
 * Merges whatever succeeds.
 */
export async function measureBacklinks(siteUrl: string): Promise<BacklinkMetrics> {
  const domain = toDomain(siteUrl);
  const base: BacklinkMetrics = {
    url: siteUrl,
    domain,
    source: 'unknown',
    measuredAt: new Date().toISOString(),
    unavailable: true,
  };

  const parts: Partial<BacklinkMetrics>[] = [];

  const seoflow = await measureViaSeoflow(domain);
  if (seoflow && !seoflow.unavailable) parts.push(seoflow);

  const cc = await measureViaCommonCrawl(domain);
  if (!cc.unavailable) parts.push(cc);

  const cdx = await measureViaCdx(domain);
  if (!cdx.unavailable) parts.push(cdx);

  const olp = await measureViaOpenLinkProfiles(domain);
  if (!olp.unavailable) parts.push(olp);

  if (!parts.length) {
    const notes = [seoflow?.note, cc.note, cdx.note, olp.note].filter(Boolean);
    return {
      ...base,
      source: 'none',
      note: notes[0] || 'all free sources unavailable',
      unavailable: true,
    };
  }

  // Merge: prefer the highest-quality source for each field.
  const merged: BacklinkMetrics = {
    ...base,
    source: parts.map((p) => p.source).filter(Boolean).join('+'),
    unavailable: false,
  };
  const first = parts[0];
  merged.totalBacklinks = first.totalBacklinks ?? null;
  merged.referringDomains = first.referringDomains ?? null;
  merged.pagesInIndex = cdx.pagesInIndex ?? null;
  merged.inCommonCrawl = parts.some((p) => p.inCommonCrawl) || Boolean(cdx.pagesInIndex);
  merged.pagerank = cc.pagerank ?? null;
  merged.harmonicCentrality = cc.harmonicCentrality ?? null;
  const note = [cc.note, cdx.note, olp.note, seoflow?.note].filter(Boolean).join('; ');
  if (note) merged.note = note;
  return merged;
}

/** Cache the last measurement in .linkflow/measure.json for before/after diffing. */
export function saveMeasurement(m: BacklinkMetrics): string {
  const dir = path.join(process.cwd(), '.linkflow');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'measure.json');
  const records: BacklinkMetrics[] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  records.push(m);
  fs.writeFileSync(p, JSON.stringify(records.slice(-50), null, 2));
  return p;
}

export function osHome(): string {
  return os.homedir();
}
