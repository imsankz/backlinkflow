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

const SUCCESS_RE = /(thank you|thanks for|submitted|submission received|we'?ve received|we'll review|we will review|got it|in review|under review|pending review|successfully (added|submitted)|your (site|tool|product|listing) (has been )?(added|submitted)|added successfully)/i;
const SOFT_ERROR_RE = /(error|failed|invalid|missing|required|try again|something went wrong|recaptcha|captcha)/i;

/**
 * Inspect the page after submit: success message, redirect to a listing page,
 * or soft error. Pure logic — returns a verdict without touching the browser.
 */
export function verdictAfterSubmit(bodyText: string, url: string, wasOnForm: boolean, fieldsFilled: number): { ok: boolean; note: string } {
  const body = bodyText || '';
  const u = url.toLowerCase();
  // Success: thank-you phrasing or redirect off the submit form.
  if (SUCCESS_RE.test(body)) return { ok: true, note: 'success message detected' };
  if (!wasOnForm && fieldsFilled > 0) return { ok: true, note: 'redirected off the form (listing/thank-you page)' };
  if (SOFT_ERROR_RE.test(body)) return { ok: false, note: 'soft error text on page' };
  return { ok: false, note: 'no success signal detected' };
}

/** Truncated exponential backoff sleep: 3s, 6s, 12s… capped at 60s. */
export function backoffSleep(attempt: number): Promise<void> {
  const ms = Math.min(3000 * Math.pow(2, attempt), 60000);
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry an async fn up to `retries` times with backoff between attempts. */
export async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; shouldRetry?: (err: unknown) => boolean }): Promise<T> {
  const retries = opts?.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && (opts?.shouldRetry ? opts.shouldRetry(err) : true)) {
        await backoffSleep(attempt);
      } else {
        break;
      }
    }
  }
  throw lastErr;
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

  // 2. Preflight with retry (transient 5xx / network blips)
  let pf: { ok: boolean; status?: number };
  try {
    pf = await withRetry(() => preflight(dir.submitUrl), { retries: 2, shouldRetry: (e) => !(e instanceof Error && /404/.test(e.message)) });
  } catch {
    pf = { ok: false };
  }
  if (!pf.ok) {
    const note = pf.status ? `preflight HTTP ${pf.status}` : 'preflight unreachable';
    // record as failed so it won't retry
    recordSubmission({ site: siteUrl, directory: dir.name, status: 'failed', submittedAt: new Date().toISOString(), notes: note });
    return { directory: dir.name, status: 'failed', note };
  }

  if (dryRun) {
    return { directory: dir.name, status: 'pending', note: 'dry-run (preflight OK)' };
  }

  // 3. Launch browser (with one retry — transient launch failures happen)
  let session;
  try {
    session = await withRetry(() => launchBrowser(), { retries: 1 });
  } catch (err) {
    const note = `browser launch failed: ${(err as Error).message.slice(0, 100)}`;
    recordSubmission({ site: siteUrl, directory: dir.name, status: 'failed', submittedAt: new Date().toISOString(), notes: note });
    return { directory: dir.name, status: 'failed', note };
  }
  const { browser, page } = session;
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
