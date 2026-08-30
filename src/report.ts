/**
 * LinkFlow — proof-of-submission report generator.
 * Produces .linkflow/report.md + .linkflow/report.json (Submitator's "detailed report" feature, open-source).
 */
import fs from 'fs';
import path from 'path';
import type { SubmissionRecord } from './types.js';

const DATA_DIR = path.join(process.cwd(), '.linkflow');
const REPORT_MD = path.join(DATA_DIR, 'report.md');
const REPORT_JSON = path.join(DATA_DIR, 'report.json');

export function writeReport(site: string, records: SubmissionRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const byStatus = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const lines: string[] = [
    `# LinkFlow Report — ${site}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `## Summary`,
    '',
    `| Status | Count |`,
    `|---|---|`,
    ...Object.entries(byStatus).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    `## Submissions`,
    '',
    `| Directory | Status | Submitted | URL | Proof |`,
    `|---|---|---|---|---|`,
    ...records.map(
      (r) =>
        `| ${r.directory} | ${r.status} | ${r.submittedAt} | ${r.url || '—'} | ${r.proof || '—'} |`
    ),
    '',
  ];

  fs.writeFileSync(REPORT_MD, lines.join('\n'));
  fs.writeFileSync(REPORT_JSON, JSON.stringify({ site, generatedAt: new Date().toISOString(), records }, null, 2));
}

export function reportPath(): { md: string; json: string } {
  return { md: REPORT_MD, json: REPORT_JSON };
}
