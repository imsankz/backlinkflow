/**
 * LinkFlow v0.2 — submission orchestrator.
 * Runs one directory submission end-to-end:
 *   preflight (HTTP check) → launch browser → navigate → adapter submit → verify → track
 */
import { launchBrowser, closeBrowser, screenshot, delay, looksLikeLogin } from './browser.js';
import { findAdapter, genericAdapter, type SubmitContext } from './adapters.js';
import type { DirectoryEntry, Payload, SubmissionRecord } from '../types.js';
import { recordSubmission } from '../tracker.js';
import { loadConfig } from '../config.js';

export interface SubmitOptions {
  siteUrl: string;
  dryRun?: boolean;
  proofDir?: string;
  maxWaitMs?: number;
}

export interface SubmitResult {
  directory: string;
  status: 'submitted' | 'pending' | 'failed' | 'skipped';
  note?: string;
  proof?: string;
}

/** Preflight HTTP check — catch dead sites before opening a browser. */
async function preflight(url: string): Promise<{ ok: boolean; status?: number }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 LinkFlow/0.2' },
    });
    if (res.status === 404) return { ok: false, status: 404 };
    if (res.status >= 500) return { ok: false, status: res.status };
    return { ok: true, status: res.status };
  } catch {
    return { ok: false };
  }
}

/** Submit one directory entry. */
export async function submitOne(dir: DirectoryEntry, payload: Payload, opts: SubmitOptions): Promise<SubmitResult> {
  const cfg = loadConfig();
  const { siteUrl, dryRun = false, proofDir = '.linkflow/proofs' } = opts;

  // 1. Skip known-dead
  if (dir.status === 'dead') {
    return { directory: dir.name, status: 'skipped', note: 'status=dead' };
  }
  if (dir.status === 'paid') {
    return { directory: dir.name, status: 'skipped', note: 'status=paid' };
  }

  // 2. Preflight
  const pf = await preflight(dir.submitUrl);
  if (!pf.ok) {
    const note = pf.status ? `preflight HTTP ${pf.status}` : 'preflight unreachable';
    // record as failed so it won't retry
    recordSubmission({ site: siteUrl, directory: dir.name, status: 'failed', submittedAt: new Date().toISOString(), notes: note });
    return { directory: dir.name, status: 'failed', note };
  }

  if (dryRun) {
    return { directory: dir.name, status: 'pending', note: 'dry-run (preflight OK)' };
  }

  // 3. Launch browser
  const { browser, page } = await launchBrowser();
  try {
    const adapter = findAdapter(dir.name) || genericAdapter;
    if (adapter.needsCredentials && !cfg.ai?.apiKey) {
      // not actually credential-related, but we check config presence loosely
    }

    const ctx: SubmitContext = {
      page,
      payload,
      siteUrl,
      email: cfg.siteName ? undefined : undefined,
      credentials: (cfg as any).credentials,
      log: (m) => console.log(m),
    };

    console.log(`  📄 Opening ${dir.submitUrl}`);
    await page.goto(dir.submitUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await delay(1500);

    // 4. Validate page
    const body = await page.textContent('body').catch(() => '');
    const url = page.url();
    if (/404|not found|page not found/i.test(body) && /404/.test(url)) {
      return { directory: dir.name, status: 'failed', note: 'page 404' };
    }
    if (looksLikeLogin(body, url)) {
      return { directory: dir.name, status: 'failed', note: 'login wall — needs credentials/manual' };
    }

    // 5. Run adapter
    const result = await adapter.submit(ctx);
    const status: 'submitted' | 'pending' | 'failed' = result.ok ? 'submitted' : 'failed';
    let proof: string | undefined;
    if (result.ok && !dryRun) {
      proof = await screenshot(page, `${dir.name.replace(/[^a-z0-9]+/gi, '-')}`, proofDir);
    }

    const rec: SubmissionRecord = {
      site: siteUrl,
      directory: dir.name,
      status,
      submittedAt: new Date().toISOString(),
      url: dir.submitUrl,
      proof,
      notes: result.note,
    };
    recordSubmission(rec);

    return { directory: dir.name, status, note: result.note, proof };
  } catch (err) {
    const note = `browser error: ${(err as Error).message.slice(0, 100)}`;
    recordSubmission({ site: siteUrl, directory: dir.name, status: 'failed', submittedAt: new Date().toISOString(), notes: note });
    return { directory: dir.name, status: 'failed', note };
  } finally {
    await closeBrowser({ browser, page });
  }
}
