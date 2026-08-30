/**
 * BacklinkFlow v0.2 — smart form field detection.
 * Finds name/url/email/description/submit elements by label, placeholder, name attrs,
 * and (v0.3) handles select dropdowns (category) and radio buttons (pricing tier).
 */

export interface FieldCandidate {
  /** CSS kind selector, e.g. 'input[type="text"]' — used with .nth(index). */
  kindSelector: string;
  index: number;
  kind: 'input' | 'textarea' | 'select' | 'radio';
  hint: string;
  /** For select: the option text to pick. For radio: the tier label matched. */
  pickValue: string;
}

const NAME_RE = /(name|title|product|app.?name|tool.?name|startup)/i;
const URL_RE = /(url|website|link|homepage|site|domain)/i;
const EMAIL_RE = /(email|e-?mail)/i;
const DESC_RE = /(desc|description|about|summary|detail|intro|what)/i;
const CATEGORY_RE = /(category|categor[ie]s|type|section|list|topic)/i;
const PRICING_RE = /(pricing|price|tier|plan|free|freemium)/i;

/** Exclude login/anti-bot fields that look like our targets but aren't. */
const EXCLUDE_RE = /(password|passwd|pwd|csrf|token|captcha|honeypot|_?wpnonce|_token|remember)/i;

/** Normalize a placeholder: "Choose a category…" → "category". */
export function normalizePlaceholder(p: string | null | undefined): string {
  if (!p) return '';
  return p
    .replace(/^(select|choose|pick|enter|your|a|an|the)\s+/gi, '')
    .replace(/…|\.\.\.|\.$/g, '')
    .trim();
}

const KIND_SELECTORS = [
  'input[type="text"]',
  'input:not([type])',
  'input[type="url"]',
  'input[type="email"]',
  'textarea',
  'select',
  'input[type="radio"]',
] as const;

/** Read form fields + their labels/placeholders/options from the page. */
export async function collectCandidates(page: any): Promise<FieldCandidate[]> {
  const raw = await page.evaluate((selList) => {
    const out: any[] = [];
    for (const sel of selList) {
      document.querySelectorAll(sel).forEach((el, idx) => {
        const e = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const tag = e.tagName.toLowerCase();
        const type = (e as HTMLInputElement).type || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text');
        out.push({
          tag,
          type,
          kindSelector: sel,
          index: idx,
          name: e.getAttribute('name') || '',
          placeholder: e.getAttribute('placeholder') || '',
          id: e.id || '',
          label: (() => {
            if (e.id) {
              const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
              if (l) return (l.textContent || '').trim();
            }
            const parent = e.closest('label, .field, .form-group, .form-field, .control, .form-control');
            if (parent) return (parent.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
            return '';
          })(),
          value: e.getAttribute('value') || '',
          options: tag === 'select' ? Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()) : [],
        });
      });
    }
    return out;
  }, [...KIND_SELECTORS]);

  const out: FieldCandidate[] = [];
  const seen = new Set<string>();
  for (const el of raw) {
    const hintRaw = `${el.label} ${el.placeholder} ${el.name}`;
    if (EXCLUDE_RE.test(hintRaw)) continue;
    const hint = hintRaw.toLowerCase();
    const key = `${el.kindSelector}:${el.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (el.tag === 'input' && ['hidden', 'checkbox', 'submit', 'button', 'file', 'password', 'radio'].includes(el.type)) {
      if (el.type !== 'radio') continue;
      // radio: keep pricing-tier groups (label, placeholder, name or option text)
      const normPh = normalizePlaceholder(el.placeholder || el.label);
      const tierMatch = /(free|basic|hobby|starter|standard|pro|premium|business|enterprise)/i.exec(`${normPh} ${hint} ${el.value}`);
      if (!PRICING_RE.test(hint) && !PRICING_RE.test(normPh) && !tierMatch) continue;
      const tier = tierMatch?.[1] || 'free';
      out.push({ kindSelector: el.kindSelector, index: el.index, kind: 'radio', hint: normPh || hint, pickValue: tier.toLowerCase() });
      continue;
    }

    if (el.tag === 'select') {
      if (!CATEGORY_RE.test(hint) && !CATEGORY_RE.test(normalizePlaceholder(el.placeholder))) continue;
      const opts: string[] = el.options || [];
      const good = opts.find((o) => /(software|saas|web|app|tool|product|ai|startup|business|other|service)/i.test(o) && !/^(select|choose|pick|--|$)/i.test(o));
      const first = opts.find((o) => !/^(select|choose|pick|--|$)/i.test(o.trim()));
      out.push({ kindSelector: el.kindSelector, index: el.index, kind: 'select', hint, pickValue: good || first || '' });
      continue;
    }

    const normPh = normalizePlaceholder(el.placeholder);
    const text = `${el.label} ${normPh} ${el.name}`;
    const kind: 'input' | 'textarea' = el.tag === 'textarea' ? 'textarea' : 'input';
    if (kind === 'textarea') {
      out.push({ kindSelector: el.kindSelector, index: el.index, kind, hint: text, pickValue: '' });
    } else if (URL_RE.test(text) || el.type === 'url') {
      out.push({ kindSelector: el.kindSelector, index: el.index, kind, hint: text, pickValue: '' });
    } else if (EMAIL_RE.test(text) || el.type === 'email') {
      out.push({ kindSelector: el.kindSelector, index: el.index, kind, hint: text, pickValue: '' });
    } else if (NAME_RE.test(text)) {
      out.push({ kindSelector: el.kindSelector, index: el.index, kind, hint: text, pickValue: '' });
    } else if (DESC_RE.test(text)) {
      out.push({ kindSelector: el.kindSelector, index: el.index, kind, hint: text, pickValue: '' });
    } else if (kind === 'input') {
      // unlabeled text input — candidate for name (last resort)
      out.push({ kindSelector: el.kindSelector, index: el.index, kind, hint: text, pickValue: '' });
    }
  }
  return out;
}

/** Build a Playwright locator for a candidate. */
export function locatorFor(page: any, c: FieldCandidate): any {
  return page.locator(c.kindSelector).nth(c.index);
}

export interface DetectedFields {
  name?: any;
  url?: any;
  email?: any;
  description?: any;
  submit?: any;
  /** select dropdowns detected as category fields (value = option text to pick) */
  selects?: { locator: any; value: string }[];
  /** radio buttons detected as pricing fields (value = tier label to pick) */
  radios?: { locator: any; value: string }[];
}

/** Detect the form fields on the current page. */
export async function detectFields(page: any): Promise<DetectedFields> {
  const out: DetectedFields = {};
  const cands = await collectCandidates(page);

  const take = (kind: FieldCandidate['kind'], re?: RegExp): FieldCandidate | undefined =>
    cands.find((c) => c.kind === kind && (!re || re.test(c.hint)));

  const urlC = take('input', URL_RE);
  const nameC = take('input', NAME_RE) || cands.find((c) => c.kind === 'input' && !URL_RE.test(c.hint) && !EMAIL_RE.test(c.hint) && !DESC_RE.test(c.hint));
  const emailC = take('input', EMAIL_RE);
  const descC = take('textarea') || take('input', DESC_RE);

  const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Add"), button:has-text("Launch"), button:has-text("Save"), button:has-text("Create"), button:has-text("Submit Tool"), button:has-text("List it")').first();

  if (urlC) out.url = locatorFor(page, urlC);
  if (nameC) out.name = locatorFor(page, nameC);
  if (emailC) out.email = locatorFor(page, emailC);
  if (descC) out.description = locatorFor(page, descC);
  out.submit = submit;

  const selectC = cands.filter((c) => c.kind === 'select');
  if (selectC.length) out.selects = selectC.map((c) => ({ locator: locatorFor(page, c), value: c.pickValue }));
  const radioC = cands.filter((c) => c.kind === 'radio');
  if (radioC.length) out.radios = radioC.map((c) => ({ locator: locatorFor(page, c), value: c.pickValue }));

  return out;
}

/** Verify a locator is visible before filling. */
export async function isUsable(loc: any | undefined): Promise<boolean> {
  if (!loc) return false;
  try {
    return await loc.isVisible();
  } catch {
    return false;
  }
}

/** Fill only visible fields, return which were filled. */
export async function fillVisible(page: any, fields: DetectedFields, data: {
  name?: string; url?: string; email?: string; description?: string; category?: string; pricing?: string;
}): Promise<string[]> {
  const filled: string[] = [];
  if (data.name && await isUsable(fields.name)) { await fields.name.fill(data.name); filled.push('name'); }
  if (data.url && await isUsable(fields.url)) { await fields.url.fill(data.url); filled.push('url'); }
  if (data.email && await isUsable(fields.email)) { await fields.email.fill(data.email); filled.push('email'); }
  if (data.description && await isUsable(fields.description)) { await fields.description.fill(data.description); filled.push('description'); }

  // Select dropdowns: choose the option matching our category hint.
  if (data.category && fields.selects) {
    for (const s of fields.selects) {
      if (!(await isUsable(s.locator))) continue;
      const want = data.category.toLowerCase();
      const opts = await s.locator.locator('option').allTextContents().catch(() => [] as string[]);
      const exact = opts.find((o) => o.toLowerCase().trim() === want);
      const fuzzy = opts.find((o) => o.toLowerCase().includes(want.slice(0, 5)) || want.includes(o.toLowerCase().slice(0, 5)));
      const pick = exact || fuzzy || s.value;
      if (pick) {
        await s.locator.selectOption({ label: pick });
        filled.push('select');
      }
      break; // one category select per form is the sane assumption
    }
  }

  // Radio buttons: click the tier matching our pricing hint.
  if (data.pricing && fields.radios) {
    for (const r of fields.radios) {
      if (!(await isUsable(r.locator))) continue;
      const want = data.pricing.toLowerCase();
      const labelText = await page.evaluate(
        (sel) => {
          const el = document.querySelector(sel);
          if (!el) return '';
          const label = el.closest('label');
          if (label) return label.textContent || '';
          const parent = el.parentElement;
          if (parent) return parent.textContent || '';
          return el.getAttribute('value') || '';
        },
        // reconstruct a css selector from the candidate's locator string
        radioSelectorFromLocator(r.locator)
      );
      const score = (t: string): number => (t.toLowerCase().includes(want) ? 2 : /(free|basic|hobby|starter|standard)/i.test(t) ? 1 : 0);
      if (score(labelText) >= 1) {
        await r.locator.check({ force: true }).catch(() => r.locator.click({ force: true }).catch(() => {}));
        filled.push('radio');
        break;
      }
    }
  }
  return filled;
}

/** Playwright locator toString gives something like locator(...) — extract the selector for page.evaluate. */
function radioSelectorFromLocator(loc: any): string {
  const s = String(loc);
  const m = s.match(/locator\((.+)\)/);
  return m ? m[1] : '';
}
