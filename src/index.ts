#!/usr/bin/env node
/**
 * LinkFlow — zero-cost backlink & directory submission engine.
 *
 * Commands:
 *   linkflow list [--category X] [--limit N]     List directories in the database
 *   linkflow search <query>                      Search directories
 *   linkflow submit <site-url> [--dry-run] [--limit N] [--category X]  Generate payloads + submit plan
 *   linkflow payload <site-url> [--directory X]  Generate AI-tailored payload only (no submission)
 *   linkflow status                              Show submission tracker summary
 *   linkflow report                              Regenerate report from tracker
 *   linkflow stats                               Database stats
 *   linkflow db:review                           Flag DB quality issues (dead links, homepage-as-submit)
 *   linkflow db:regenerate                       Rebuild DB from source lists (scripts/regenerate-db.py)
 *   linkflow indexnow <url> [--skip-verify] [--urls a b c]   Ping IndexNow + Google (v0.3)
 *   linkflow awesome <repo> --dry-run            Generate awesome-list PR snippet (dry-run only, v0.3)
 *   linkflow measure <url> [--json]              Measure backlinks via free sources (v0.4)
 *   linkflow init                                Print config template
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadDirectories, searchDirectories, categories, dbStats } from './database.js';
import { loadConfig, hasAiConfig, printConfigSummary } from './config.js';
import { resetAiCallCount, getAiCallCount } from './ai.js';
import { generatePayload } from './payload.js';
import { loadTracker, alreadySubmitted, recordSubmission, trackerSummary } from './tracker.js';
import { writeReport, reportPath } from './report.js';
import { submitOne } from './engine/submit.js';

const rawArgs = process.argv.slice(2);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERB = rawArgs[0] && !rawArgs[0].startsWith('--') ? rawArgs[0] : 'list';
const VERB_ARG = rawArgs[1] && !rawArgs[1].startsWith('--') ? rawArgs[1] : null;

const flag = (name: string): string | undefined => {
  const i = rawArgs.indexOf(name);
  return i !== -1 ? rawArgs[i + 1] : undefined;
};
const has = (name: string): boolean => rawArgs.includes(name);

const DRY_RUN = has('--dry-run');
const LIMIT = parseInt(flag('--limit') || '0') || 0;
const CONFIG_FILE = flag('--config');

function formatDir(d: any, i: number): string {
  return `${String(i + 1).padStart(3)}. ${d.name.padEnd(28)} [${d.category.padEnd(22)}] auto=${d.auto} ${d.dr ? `DR${d.dr}` : ''} ${d.status && d.status !== 'active' ? `(${d.status})` : ''}`;
}

async function cmdList(): Promise<void> {
  const cat = flag('--category');
  const all = loadDirectories();
  const filtered = cat ? all.filter((d) => d.category === cat) : all;
  console.log(`\nBacklinkFlow directory database: ${all.length} sites\n`);
  for (const [i, d] of filtered.entries()) {
    if (LIMIT && i >= LIMIT) break;
    console.log(formatDir(d, i));
  }
  console.log(`\n  Categories: ${categories().join(', ')}`);
}

async function cmdSearch(): Promise<void> {
  const q = VERB_ARG || '';
  const results = searchDirectories(q);
  console.log(`\nSearch "${q}": ${results.length} matches\n`);
  for (const [i, d] of results.entries()) {
    if (LIMIT && i >= LIMIT) break;
    console.log(formatDir(d, i));
    console.log(`       ${d.submitUrl}`);
  }
}

async function cmdSubmit(): Promise<void> {
  const siteUrl = VERB_ARG;
  if (!siteUrl) {
    console.log('Usage: backlinkflow submit <site-url> [--dry-run] [--limit N] [--category X] [--go]');
    process.exit(1);
  }
  const cfg = loadConfig(CONFIG_FILE);
  console.log('\nBacklinkFlow submit');
  console.log('─'.repeat(50));
  printConfigSummary(cfg);

  if (!hasAiConfig(cfg)) {
    console.log('  ⚠️  No AI config (.env.local AI_BASE_URL/AI_API_KEY) — using template payloads.');
  }

  const cat = flag('--category');
  const targets = loadDirectories().filter((d) => {
    if (cat && d.category !== cat) return false;
    return d.auto === 'yes' || d.auto === 'manual'; // skip dead/paid-only
  });
  const selected = LIMIT ? targets.slice(0, LIMIT) : targets;

  console.log(`\n  Target directories: ${selected.length} (auto+manual, ${cat || 'all categories'})\n`);
  resetAiCallCount();

  const records = loadTracker();
  let submitted = 0, skipped = 0, failed = 0;

  for (const [i, dir] of selected.entries()) {
    if (alreadySubmitted(siteUrl, dir.name)) {
      console.log(`  [${i + 1}/${selected.length}] ⏭️  ${dir.name} — already submitted (tracked)`);
      skipped++;
      continue;
    }
    const payload = await generatePayload(dir, cfg);
    console.log(`  [${i + 1}/${selected.length}] 🚀 ${dir.name}`);
    console.log(`       tagline: ${payload.tagline.slice(0, 80)}`);
    console.log(`       submit: ${dir.submitUrl}`);

    if (has('--go')) {
      // REAL automation via Playwright
      const result = await submitOne(dir, payload, {
        siteUrl,
        proofDir: '.linkflow/proofs',
      });
      console.log(`       → ${result.status}: ${result.note || ''}${result.proof ? ` (proof: ${result.proof})` : ''}`);
      if (result.status === 'submitted') submitted++;
      else if (result.status === 'failed') failed++;

      // pacing between submissions (respect per-day limit)
      const perDay = cfg.pacing?.perDay ?? 10;
      if (i + 1 >= perDay && i + 1 < selected.length) {
        console.log(`  ⏸️  Daily pacing limit (${perDay}) reached — stopping.`);
        break;
      }
      if (i + 1 < selected.length) {
        const pause = (cfg.pacing?.minSeconds ?? 60) * 1000;
        console.log(`  ⏳ pacing ${pause / 1000}s before next…`);
        await new Promise((r) => setTimeout(r, pause));
      }
    } else {
      // plan-only mode (v0.1 behavior)
      console.log(`       desc: ${payload.description.slice(0, 100)}`);
      if (!DRY_RUN) {
        recordSubmission({
          site: siteUrl,
          directory: dir.name,
          status: 'pending',
          submittedAt: new Date().toISOString(),
          url: dir.submitUrl,
          notes: 'planned — run with --go for automation',
        });
        submitted++;
      }
    }
  }

  console.log(`\n  Done: ${submitted} submitted/planned, ${skipped} skipped, ${failed} failed. AI calls: ${getAiCallCount()}`);

  if (!DRY_RUN) {
    const all = loadTracker();
    writeReport(siteUrl, all.filter((r) => r.site === siteUrl));
    const { md } = reportPath();
    console.log(`  Report: ${md}`);
  } else {
    console.log('  (dry-run — nothing recorded)');
  }
}

async function cmdPayload(): Promise<void> {
  const siteUrl = VERB_ARG;
  if (!siteUrl) {
    console.log('Usage: backlinkflow payload <site-url> [--directory X]');
    process.exit(1);
  }
  const cfg = loadConfig(CONFIG_FILE);
  const dirName = flag('--directory');
  const dirs = dirName ? loadDirectories().filter((d) => d.name.toLowerCase().includes(dirName.toLowerCase())) : loadDirectories();
  if (!dirs.length) {
    console.log('  No matching directory.');
    return;
  }
  for (const dir of dirs.slice(0, 3)) {
    const payload = await generatePayload(dir, cfg);
    console.log(`\n=== ${dir.name} ===`);
    console.log(JSON.stringify(payload, null, 2));
  }
}

function cmdStatus(): void {
  const s = trackerSummary();
  console.log('\nBacklinkFlow tracker');
  console.log('─'.repeat(50));
  console.log(`  Total records: ${s.total}`);
  for (const [k, v] of Object.entries(s.byStatus)) console.log(`  ${k}: ${v}`);
  if (s.sites.length) console.log(`  Sites: ${s.sites.join(', ')}`);
}

function cmdReport(): void {
  const cfg = loadConfig();
  const site = VERB_ARG || cfg.siteUrl || 'all';
  const all = loadTracker();
  const filtered = site === 'all' ? all : all.filter((r) => r.site === site);
  writeReport(site, filtered);
  const { md } = reportPath();
  console.log(`\n  Report written: ${md}`);
}

function cmdStats(): void {
  const s = dbStats();
  console.log('\nBacklinkFlow database stats');
  console.log('─'.repeat(50));
  console.log(`  Total directories: ${s.total}`);
  for (const [k, v] of Object.entries(s.byCategory)) console.log(`  ${k}: ${v}`);
  console.log(`  Auto-submittable: ${s.auto}`);
}

function cmdInit(): void {
  const tpl = {
    siteName: 'My Product',
    siteUrl: 'https://example.com',
    siteDescription: 'A short, honest description of what it is and who it is for.',
    tags: ['saas', 'devtools'],
    contentDomain: 'SaaS product',
    writingSample: 'Paste 2-3 sentences in your site voice here.',
    ai: {
      provider: 'openai',
      baseUrl: 'http://192.168.0.254:20128/v1',
      apiKey: 'your-omniroute-key',
      model: 'auto/best-free',
      maxCallsPerRun: 20,
    },
    pacing: { minSeconds: 60, perDay: 10 },
  };
  const p = path.join(process.cwd(), 'linkflow.config.json');
  if (fs.existsSync(p)) {
    console.log(`  ${p} already exists — not overwriting.`);
  } else {
    fs.writeFileSync(p, JSON.stringify(tpl, null, 2));
    console.log(`  Created ${p}`);
  }
}

async function cmdDbReview(): Promise<void> {
  const { execSync } = await import('child_process');
  const script = path.join(__dirname, '..', 'scripts', 'review-db.py');
  if (!fs.existsSync(script)) {
    console.log('  review-db.py not found — run from repo root.');
    return;
  }
  try {
    const out = execSync(`python3 "${script}"`, { encoding: 'utf8' });
    console.log(out);
  } catch (err) {
    console.log('  Review failed:', (err as Error).message);
  }
}

async function cmdDbRegenerate(): Promise<void> {
  const { execSync } = await import('child_process');
  const script = path.join(__dirname, '..', 'scripts', 'regenerate-db.py');
  if (!fs.existsSync(script)) {
    console.log('  regenerate-db.py not found — run from repo root.');
    return;
  }
  try {
    const out = execSync(`python3 "${script}"`, { encoding: 'utf8' });
    console.log(out);
  } catch (err) {
    console.log('  Regenerate failed:', (err as Error).message);
  }
}

/** v0.3 — IndexNow + Google sitemap ping. Real API call, no key (UUID host key). */
async function cmdIndexNow(): Promise<void> {
  const cfg = loadConfig(CONFIG_FILE);
  const siteUrl = VERB_ARG || cfg.siteUrl;
  if (!siteUrl) {
    console.log('Usage: backlinkflow indexnow <url>  (or set siteUrl in config)');
    process.exit(1);
  }
  const { pingSite, resolveIndexNowKey, toHost } = await import('./indexnow.js');
  const key = resolveIndexNowKey(cfg);
  const host = toHost(siteUrl);

  console.log('\nBacklinkFlow IndexNow ping');
  console.log('─'.repeat(50));
  console.log(`  host:        ${host}`);
  console.log(`  key:         ${key}`);
  console.log(`  key file:    https://${host}/${key}.txt  (publish this file, see README)`);

  const urls = flag('--urls')?.split(' ') || undefined;
  const r = await pingSite(siteUrl, { urls, skipVerify: has('--skip-verify') });

  if (r.indexnow) {
    console.log(`\n  IndexNow (Bing/Yandex/Naver/Seznam) → ${r.indexnow.endpoint}`);
    if (r.indexnow.ok) {
      console.log(`    ✅ ${r.indexnow.submitted} URL(s) accepted (HTTP ${r.indexnow.statusCode})`);
      for (const u of urls || [`https://${host}/`, `https://${host}/sitemap.xml`]) console.log(`       • ${u}`);
    } else {
      console.log(`    ❌ ${r.indexnow.error || 'rejected'}`);
      if (!r.keyLocation && !has('--skip-verify')) {
        console.log('       → is the key file published? Run with --skip-verify to force-submit anyway.');
      }
    }
  }
  if (r.google) {
    console.log(`\n  Google sitemap ping → https://www.google.com/ping?sitemap=`);
    if (r.google.ok) console.log(`    ✅ ping accepted (HTTP ${r.google.statusCode})`);
    else console.log(`    ⚠️  ${r.google.error || 'failed'} (Google often returns non-200; harmless)`);
  }
  console.log('\n  Note: Google does not consume IndexNow. The sitemap ping above is the');
  console.log('  free Google signal. Key file must stay published at the keyLocation.');
}

/** v0.3 — awesome-list PR generator (DRY-RUN ONLY — never opens PRs). */
async function cmdAwesome(): Promise<void> {
  const repo = VERB_ARG;
  if (!repo || !DRY_RUN) {
    console.log('Usage: backlinkflow awesome <owner/repo> --dry-run');
    console.log('  (dry-run only — this command never opens PRs or pushes)');
    process.exit(1);
  }
  const cfg = loadConfig(CONFIG_FILE);
  const { buildSnippet, buildPrBody, buildInstructions } = await import('./awesome.js');
  const snippet = buildSnippet(cfg);

  console.log('\nBacklinkFlow awesome-list generator (DRY RUN)');
  console.log('─'.repeat(50));
  console.log(`\n  Target repo: ${repo}`);
  console.log(`  Suggested section: ${snippet.suggestedSection}`);
  console.log('\n  ── Markdown snippet to add ──');
  console.log(`\n  ${snippet.markdown}`);
  console.log('\n  ── PR body ──');
  console.log('\n' + buildPrBody(cfg, repo));
  console.log('\n  ── How to turn this into a real contribution ──');
  console.log('\n' + buildInstructions(repo, snippet));
  console.log('\n  (dry-run complete — nothing was pushed, no PR opened)');
}

/** v0.4 — measure backlinks via free sources (Common Crawl + OpenLinkProfiles). */
async function cmdMeasure(): Promise<void> {
  const cfg = loadConfig(CONFIG_FILE);
  const siteUrl = VERB_ARG || cfg.siteUrl;
  if (!siteUrl) {
    console.log('Usage: backlinkflow measure <url>  (or set siteUrl in config)');
    process.exit(1);
  }
  const { measureBacklinks, saveMeasurement } = await import('./measure.js');
  const m = await measureBacklinks(siteUrl);
  const file = saveMeasurement(m);

  if (has('--json')) {
    console.log(JSON.stringify(m, null, 2));
    return;
  }

  console.log('\nBacklinkFlow backlink measurement');
  console.log('─'.repeat(50));
  console.log(`  domain:    ${m.domain}`);
  console.log(`  sources:   ${m.source}`);
  console.log(`  measured:  ${m.measuredAt}`);
  if (m.unavailable) {
    console.log('  ⚠️  All free sources unavailable — no numbers to report.');
    if (m.note) console.log(`      ${m.note}`);
  } else {
    console.log(`  total backlinks:   ${m.totalBacklinks ?? 'n/a'}`);
    console.log(`  referring domains: ${m.referringDomains ?? 'n/a'}`);
    if (m.pagesInIndex !== null && m.pagesInIndex !== undefined) console.log(`  pages in CC index: ${m.pagesInIndex}`);
    if (m.inCommonCrawl !== undefined) console.log(`  in Common Crawl:   ${m.inCommonCrawl}`);
    if (m.pagerank !== null && m.pagerank !== undefined) console.log(`  CC PageRank:       ${m.pagerank}`);
    if (m.harmonicCentrality !== null && m.harmonicCentrality !== undefined) console.log(`  CC harmonic centr: ${m.harmonicCentrality}`);
  }
  if (m.note) console.log(`  note: ${m.note}`);
  console.log(`  cached:    ${file}`);
  console.log('\n  Tip: run again after submissions to diff before/after.');
}

async function main(): Promise<void> {
  switch (VERB) {
    case 'list': await cmdList(); break;
    case 'search': await cmdSearch(); break;
    case 'submit': await cmdSubmit(); break;
    case 'payload': await cmdPayload(); break;
    case 'status': cmdStatus(); break;
    case 'report': cmdReport(); break;
    case 'stats': cmdStats(); break;
    case 'db:review': await cmdDbReview(); break;
    case 'db:regenerate': await cmdDbRegenerate(); break;
    case 'indexnow': await cmdIndexNow(); break;
    case 'awesome': await cmdAwesome(); break;
    case 'measure': await cmdMeasure(); break;
    case 'init': cmdInit(); break;
    default:
      console.log(`Unknown command: ${VERB}\nRun 'backlinkflow' with: list | search | submit | payload | status | report | stats | db:review | db:regenerate | indexnow | awesome | measure | init`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('BacklinkFlow error:', err);
  process.exit(1);
});
