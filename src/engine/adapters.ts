/**
 * LinkFlow v0.2 — site adapter registry.
 * Each adapter knows how to submit to one directory. The generic adapter
 * auto-detects form fields; site-specific adapters handle login/paywall/captcha.
 */
import type { Page } from 'playwright';
import type { Payload } from '../types.js';

export interface SubmitContext {
  page: Page;
  payload: Payload;
  siteUrl: string;
  email?: string;
  /** credentials for login-required sites (from config) */
  credentials?: Record<string, { email?: string; password?: string }>;
  /** log a step */
  log: (msg: string) => void;
}

export interface Adapter {
  /** Directory name(s) this adapter handles (matched against dir.name). */
  matches: string[];
  /** Requires login credentials? */
  needsCredentials?: boolean;
  submit(ctx: SubmitContext): Promise<{ ok: boolean; proof?: string; note?: string }>;
}

/** Try to click a submit button, fallback to Enter. */
async function clickSubmit(page: Page): Promise<boolean> {
  const btn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Add"), button:has-text("Launch"), button:has-text("Save")').first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    return true;
  }
  // fallback: press Enter in a focused field
  await page.keyboard.press('Enter');
  return true;
}

/** Generic adapter — smart auto-detection for any form-based directory. */
export const genericAdapter: Adapter = {
  matches: [],
  async submit({ page, payload, siteUrl, log }) {
    // Wait for form to settle
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // Detect and fill fields
    const name = page.locator('input[name*="name" i], input[placeholder*="name" i], input[placeholder*="title" i]').first();
    const url = page.locator('input[name*="url" i], input[type="url"], input[placeholder*="url" i], input[placeholder*="website" i]').first();
    const email = page.locator('input[type="email"], input[name*="email" i]').first();
    const desc = page.locator('textarea').first();

    let filled = 0;
    if (await name.isVisible().catch(() => false)) { await name.fill(payload.name); filled++; }
    if (await url.isVisible().catch(() => false)) { await url.fill(siteUrl); filled++; }
    if (await email.isVisible().catch(() => false) && payload.fields?.email) { await email.fill(payload.fields.email); filled++; }
    if (await desc.isVisible().catch(() => false)) { await desc.fill(payload.description); filled++; }

    if (filled === 0) {
      return { ok: false, note: 'no fillable form fields detected' };
    }

    log(`  filled ${filled} fields`);
    await page.waitForTimeout(800);

    // Submit
    const ok = await clickSubmit(page);
    await page.waitForTimeout(2500);

    // Verify: did we leave the form / get a success message?
    const body = await page.textContent('body').catch(() => '');
    const success = /(thank you|submitted|success|received|we'll review|got it|in review|pending|added)/i.test(body);
    const stillOnForm = await name.isVisible().catch(() => false);

    return {
      ok: ok && (success || !stillOnForm),
      note: success ? 'success message detected' : stillOnForm ? 'may still be on form' : 'form submitted, awaiting response',
    };
  },
};

/** SaaSHub — requires login. */
export const saashubAdapter: Adapter = {
  matches: ['SaaSHub', 'saashub.com'],
  needsCredentials: true,
  async submit({ page, payload, siteUrl, credentials, log }) {
    const creds = credentials?.saashub;
    if (!creds?.email || !creds?.password) {
      return { ok: false, note: 'SaaSHub needs credentials.saashub in config' };
    }
    // Login
    await page.goto('https://www.saashub.com/login');
    await page.waitForTimeout(1200);
    await page.fill('input[name="email"], input[type="email"]', creds.email);
    await page.fill('input[name="password"], input[type="password"]', creds.password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForTimeout(2500);

    // Submit page
    await page.goto('https://www.saashub.com/new');
    await page.waitForTimeout(1500);
    await genericAdapter.submit({ page, payload, siteUrl, log });
    return { ok: true, note: 'submitted via saashub adapter' };
  },
};

/** Product Hunt — anti-bot, manual only. Mark as manual. */
export const productHuntAdapter: Adapter = {
  matches: ['Product Hunt', 'producthunt.com'],
  async submit() {
    return { ok: false, note: 'Product Hunt is manual-only (anti-bot). Use linkflow payload to prep copy.' };
  },
};

/** Registry: all adapters. */
export const ADAPTERS: Adapter[] = [genericAdapter, saashubAdapter, productHuntAdapter];

/** Find an adapter for a directory name. */
export function findAdapter(dirName: string): Adapter | null {
  const n = dirName.toLowerCase();
  return ADAPTERS.find((a) => a.matches.some((m) => n.includes(m.toLowerCase()))) || null;
}
