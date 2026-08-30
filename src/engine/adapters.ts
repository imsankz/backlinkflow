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

    // Detect and fill fields (v0.3: also select dropdowns + radio pricing)
    const { detectFields, fillVisible } = await import('./fields.js');
    const fields = await detectFields(page);

    let filled = 0;
    if (await fields.name?.isVisible().catch(() => false)) { await fields.name.fill(payload.name); filled++; }
    if (await fields.url?.isVisible().catch(() => false)) { await fields.url.fill(siteUrl); filled++; }
    if (await fields.email?.isVisible().catch(() => false) && payload.fields?.email) { await fields.email.fill(payload.fields.email); filled++; }
    if (await fields.description?.isVisible().catch(() => false)) { await fields.description.fill(payload.description); filled++; }
    // select dropdowns (category) + radios (pricing)
    if (payload.category && fields.selects) {
      for (const s of fields.selects) {
        if (!(await s.locator.isVisible().catch(() => false))) continue;
        const opts = await s.locator.locator('option').allTextContents().catch(() => [] as string[]);
        const want = payload.category.toLowerCase();
        const exact = opts.find((o) => o.toLowerCase().trim() === want);
        const fuzzy = opts.find((o) => o.toLowerCase().includes(want.slice(0, 5)) || want.includes(o.toLowerCase().slice(0, 5)));
        const pick = exact || fuzzy || s.value;
        if (pick) { await s.locator.selectOption({ label: pick }); filled++; }
        break;
      }
    }
    if (payload.fields?.pricing && fields.radios) {
      for (const r of fields.radios) {
        if (!(await r.locator.isVisible().catch(() => false))) continue;
        await r.locator.check({ force: true }).catch(() => r.locator.click({ force: true }).catch(() => {}));
        filled++;
        break;
      }
    }

    if (filled === 0) {
      return { ok: false, note: 'no fillable form fields detected' };
    }

    log(`  filled ${filled} fields`);
    await page.waitForTimeout(800);

    // Submit
    const ok = await clickSubmit(page);
    await page.waitForTimeout(2500);

    // Verify via shared pure logic: success message, redirect off form, soft error
    const { verdictAfterSubmit } = await import('./submit.js');
    const body = await page.textContent('body').catch(() => '');
    const stillOnForm = await fields.name?.isVisible().catch(() => false) ?? true;
    const v = verdictAfterSubmit(body, page.url(), !stillOnForm, filled);

    return {
      ok: ok && v.ok,
      note: v.ok ? v.note : ok ? `${v.note} (submitted but unverified)` : 'submit button click failed',
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
