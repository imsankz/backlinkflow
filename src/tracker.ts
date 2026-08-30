/**
 * LinkFlow — submission tracker.
 * Persists submission history to .linkflow/tracker.json (gitignored).
 */
import fs from 'fs';
import path from 'path';
import type { SubmissionRecord } from './types.js';

const DATA_DIR = path.join(process.cwd(), '.linkflow');
const TRACKER_PATH = path.join(DATA_DIR, 'tracker.json');

export function loadTracker(): SubmissionRecord[] {
  if (!fs.existsSync(TRACKER_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
  } catch {
    return [];
  }
}

export function saveTracker(records: SubmissionRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(records, null, 2));
}

export function alreadySubmitted(site: string, directory: string): boolean {
  return loadTracker().some(
    (r) => r.site === site && r.directory === directory && r.status !== 'failed'
  );
}

export function recordSubmission(rec: SubmissionRecord): void {
  const records = loadTracker();
  // upsert: replace any existing record for same site+directory
  const idx = records.findIndex((r) => r.site === rec.site && r.directory === rec.directory);
  if (idx !== -1) records[idx] = rec;
  else records.push(rec);
  saveTracker(records);
}

export function trackerSummary(): { total: number; byStatus: Record<string, number>; sites: string[] } {
  const records = loadTracker();
  const byStatus: Record<string, number> = {};
  for (const r of records) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  return {
    total: records.length,
    byStatus,
    sites: [...new Set(records.map((r) => r.site))],
  };
}
