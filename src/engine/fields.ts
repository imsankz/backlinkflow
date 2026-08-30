/**
 * LinkFlow v0.2 — smart form field detection.
 * Finds name/url/email/description/submit elements by label, placeholder, and name attrs.
 */
import type { Page, Locator } from 'playwright';

export interface DetectedFields {
  name?: Locator;
  url?: Locator;
  email?: Locator;
  description?: Locator;
  submit?: Locator;
}

const NAME_RE = /(name|title|product|app.?name|tool.?name|startup)/i;
const URL_RE = /(url|website|link|homepage|site|domain)/i;
const EMAIL_RE = /(email|e-?mail)/i;
const DESC_RE = /(desc|description|about|summary|detail|intro|what)/i;
const SUBMIT_RE = /(submit|send|add|post|create|list|suggest|save|launch)/i;

/** Build a locator list from label+placeholder+name attrs. */
function byText(page: Page, re: RegExp): Locator[] {
  return [
    page.locator('input[type="text"], input:not([type]), textarea, input[type="url"], input[type="email"]').filter({ hasText: re }),
    page.locator('input[type="text"], input:not([type]), textarea, input[type="url"], input[type="email"]').filter({ has: page.locator('..') }),
    page.locator(`input[placeholder*="${re.source}" i]`),
    page.locator(`input[name*="${re.source}" i]`),
    page.locator(`textarea[placeholder*="${re.source}" i]`),
    page.locator(`textarea[name*="${re.source}" i]`),
  ].flat();
}

/** Detect the form fields on the current page. */
export async function detectFields(page: Page): Promise<DetectedFields> {
  const out: DetectedFields = {};

  // Name
  out.name = page.locator('input[name*="name" i], input[placeholder*="name" i], input[placeholder*="title" i], input[name*="title" i]').first().or(page.locator('input[type="text"]').first());
  // URL
  out.url = page.locator('input[name*="url" i], input[type="url"], input[placeholder*="url" i], input[placeholder*="website" i]').first();
  // Email
  out.email = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
  // Description
  out.description = page.locator('textarea').first();
  // Submit
  out.submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Add"), button:has-text("Launch"), button:has-text("Save")').first();

  return out;
}

/** Verify a locator is visible before filling. */
export async function isUsable(loc: Locator | undefined): Promise<boolean> {
  if (!loc) return false;
  try {
    return await loc.isVisible();
  } catch {
    return false;
  }
}

/** Fill only visible fields, return which were filled. */
export async function fillVisible(page: Page, fields: DetectedFields, data: {
  name?: string; url?: string; email?: string; description?: string;
}): Promise<string[]> {
  const filled: string[] = [];
  if (data.name && await isUsable(fields.name)) { await fields.name!.fill(data.name); filled.push('name'); }
  if (data.url && await isUsable(fields.url)) { await fields.url!.fill(data.url); filled.push('url'); }
  if (data.email && await isUsable(fields.email)) { await fields.email!.fill(data.email); filled.push('email'); }
  if (data.description && await isUsable(fields.description)) { await fields.description!.fill(data.description); filled.push('description'); }
  return filled;
}
