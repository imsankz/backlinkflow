/**
 * LinkFlow v0.2 — browser engine wrapper around Playwright.
 * Headless Chromium, humanized typing, screenshots for proof-of-submission.
 */
import { chromium, type Browser, type Page } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  page: Page;
}

/** Launch a fresh headless browser (non-headless if LINKFLOW_HEADED=1). */
export async function launchBrowser(): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: !process.env.LINKFLOW_HEADED,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  return { browser, page };
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.browser.close();
}

/** Human-like typing with random delay between keys. */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 20 + Math.random() * 40 });
  }
}

/** Screenshot the current page — proof of submission state. */
export async function screenshot(page: Page, name: string, dir: string): Promise<string> {
  const fs = await import('fs');
  fs.mkdirSync(dir, { recursive: true });
  const p = `${dir}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

/** Random humanized delay between actions. */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms + Math.random() * 500));
}

/** Scroll the page slowly to trigger lazy-loading forms. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
}

/** Detect if the page looks like a login wall (vs an open form). */
export function looksLikeLogin(bodyText: string, pageUrl: string): boolean {
  const b = bodyText.toLowerCase().slice(0, 1000);
  const u = pageUrl.toLowerCase();
  const hasLoginForm = /(log ?in|sign ?in|log ?in|create account|register)/.test(b);
  const hasSubmitForm = /(submit|add (your )?(tool|site|product|app)|get listed|list your)/.test(b);
  return hasLoginForm && !hasSubmitForm;
}
