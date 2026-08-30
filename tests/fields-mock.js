/**
 * Quick DOM-mock sanity check for the new pure field-detection logic.
 * Mocks the subset of Playwright API the detection uses.
 * Run: node tests/fields-mock.js (after npm run build)
 */

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// --- fake DOM: name input, url input, select (category), radio (pricing), textarea ---
const fakeDom = {
  querySelectorAll(sel) {
    const els = [];
    const mk = (tag, type, attrs, opts) => ({
      tagName: tag.toUpperCase(),
      type: type || '',
      getAttribute: (a) => attrs[a] ?? null,
      id: attrs.id || '',
      options: opts || [],
    });
    if (sel === 'input[type="text"]') els.push(mk('input', 'text', { name: 'tool_name', placeholder: 'Your product name' }));
    if (sel === 'input[type="url"]') els.push(mk('input', 'url', { name: 'website', placeholder: 'https://…' }));
    if (sel === 'input[type="email"]') els.push(mk('input', 'email', { name: 'email' }));
    if (sel === 'textarea') els.push(mk('textarea', 'textarea', { name: 'description', placeholder: 'Describe your tool' }));
    if (sel === 'select') els.push(mk('select', 'select', { name: 'category' }, ['Select…', 'Software', 'SaaS', 'AI']));
    if (sel === 'input[type="radio"]') els.push(mk('input', 'radio', { name: 'pricing', value: 'free' }), mk('input', 'radio', { name: 'pricing', value: 'pro' }));
    return els;
  },
};

const pageStub = {
  async evaluate(fn, arg) {
    // emulate the DOM query: fn is the browser-side function; we just need
    // the field collection from our fake DOM.
    const out = [];
    for (const sel of arg) {
      for (const e of fakeDom.querySelectorAll(sel)) {
        const tag = e.tagName.toLowerCase();
        // real browser reads the element *property* (e.g. radio.type === 'radio')
        const type = e.type || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text');
        out.push({
          tag, type, kindSelector: sel,
          index: out.filter((o) => o.kindSelector === sel).length,
          name: e.getAttribute('name') || '',
          placeholder: e.getAttribute('placeholder') || '',
          id: e.id || '',
          label: '',
          value: e.getAttribute('value') || '',
          options: e.options || [],
        });
      }
    }
    return out;
  },
  locator(sel) {
    const mk = () => ({ isVisible: async () => true, fill: async () => {}, selectOption: async () => {}, check: async () => {}, click: async () => {}, __sel: sel });
    const loc = mk();
    loc.first = () => mk();
    loc.nth = () => mk();
    loc.locator = () => ({ allTextContents: async () => [] });
    loc.toString = () => `locator(${sel})`;
    return loc;
  },
};

const { detectFields } = await import('../dist/engine/fields.js');
const fields = await detectFields(pageStub);

assert(fields.name, 'name field not detected');
assert(fields.url, 'url field not detected');
assert(fields.description, 'description not detected');
assert(fields.selects && fields.selects.length === 1, `expected 1 select, got ${fields.selects?.length}`);
assert(['Software', 'SaaS'].includes(fields.selects[0].value), `select value ${fields.selects[0].value} not a good category pick`);
assert(fields.radios && fields.radios.length >= 1, 'radios not detected');
assert(fields.radios.some((r) => /(free|basic|hobby|starter)/i.test(r.value)), 'radio free tier not picked');
console.log('  ✅ fields-mock: name/url/desc/select/radio all detected');
console.log('     select pick:', fields.selects[0].value);
console.log('     radio picks:', fields.radios.map((r) => r.value).join(', '));
