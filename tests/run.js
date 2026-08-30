/**
 * LinkFlow — test suite (mirrors secflow's tests/run.js).
 */
import { loadDirectories, searchDirectories, categories, dbStats } from '../dist/database.js';
import { templatePayload, generatePayload } from '../dist/payload.js';
import { loadConfig } from '../dist/config.js';
import { loadTracker, recordSubmission, alreadySubmitted, trackerSummary, saveTracker } from '../dist/tracker.js';

let pass = 0, fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('\nLinkFlow tests\n');

t('database loads 1000+ entries', () => {
  const all = loadDirectories();
  if (all.length < 1000) throw new Error(`expected >=1000, got ${all.length}`);
});

t('dead entries are flagged', () => {
  const all = loadDirectories();
  const dead = all.filter((d) => d.status === 'dead');
  if (dead.length < 200) throw new Error(`expected >=200 dead, got ${dead.length}`);
});

t('categories include ai/general/startup/travel', () => {
  const cats = categories();
  for (const c of ['ai', 'general', 'startup', 'community', 'travel']) {
    if (!cats.includes(c)) throw new Error(`missing category ${c}`);
  }
});

t('search finds futuretools', () => {
  const r = searchDirectories('futuretools');
  if (!r.length) throw new Error('no match');
});

t('dbStats counts match', () => {
  const s = dbStats();
  if (s.total !== loadDirectories().length) throw new Error('mismatch');
});

t('template payload has required fields', () => {
  const cfg = { siteName: 'Test', siteUrl: 'https://test.com', siteDescription: 'A test.' };
  const p = templatePayload(loadDirectories()[0], cfg);
  if (!p.name || !p.website || !p.description) throw new Error('missing fields');
  if (p.description !== 'A test.') throw new Error('description not used');
});

t('tracker records + dedupes', () => {
  // self-clean: remove any pre-existing records for this test site
  const pre = loadTracker().filter((r) => r.site !== 'https://test.com');
  saveTracker(pre);

  recordSubmission({ site: 'https://test.com', directory: 'TestDir', status: 'pending', submittedAt: new Date().toISOString() });
  recordSubmission({ site: 'https://test.com', directory: 'TestDir', status: 'submitted', submittedAt: new Date().toISOString() });
  const s = trackerSummary();
  if (s.total !== 1) throw new Error(`expected 1 record, got ${s.total}`);
  if (s.byStatus.submitted !== 1) throw new Error('upsert failed');
  if (!alreadySubmitted('https://test.com', 'TestDir')) throw new Error('alreadySubmitted false');

  // cleanup
  saveTracker(pre);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
