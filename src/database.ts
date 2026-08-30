/**
 * LinkFlow — directory database loader.
 * Loads data/directories.yaml (or the bundled copy in dist/).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { DirectoryEntry } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _cache: DirectoryEntry[] | null = null;

/** Resolve the directories.yaml path, preferring the source then the bundled copy. */
function resolveDbPath(): string {
  const candidates = [
    path.join(process.cwd(), 'data', 'directories.yaml'),
    path.join(__dirname, 'directories.yaml'),
    path.join(__dirname, '..', 'data', 'directories.yaml'),
    path.join(process.cwd(), 'node_modules', 'linkflow', 'data', 'directories.yaml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('LinkFlow: directories.yaml not found. Run from project root or install the package.');
}

export function loadDirectories(): DirectoryEntry[] {
  if (_cache) return _cache;
  const raw = fs.readFileSync(resolveDbPath(), 'utf8');
  const doc = yaml.load(raw) as Record<string, DirectoryEntry[]>;
  const out: DirectoryEntry[] = [];
  for (const [category, entries] of Object.entries(doc)) {
    for (const e of entries) {
      out.push({ ...e, category });
    }
  }
  _cache = out;
  return out;
}

export function findDirectory(nameOrUrl: string): DirectoryEntry | undefined {
  const q = nameOrUrl.toLowerCase();
  return loadDirectories().find(
    (d) =>
      d.name.toLowerCase() === q ||
      d.submitUrl.toLowerCase().includes(q) ||
      q.includes(d.submitUrl.toLowerCase())
  );
}

export function searchDirectories(query: string, category?: string): DirectoryEntry[] {
  const q = query.toLowerCase();
  return loadDirectories().filter((d) => {
    if (category && d.category !== category) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      (d.notes || '').toLowerCase().includes(q) ||
      d.submitUrl.toLowerCase().includes(q)
    );
  });
}

export function categories(): string[] {
  return [...new Set(loadDirectories().map((d) => d.category))];
}

export function dbStats(): { total: number; byCategory: Record<string, number>; auto: number } {
  const all = loadDirectories();
  const byCategory: Record<string, number> = {};
  let auto = 0;
  for (const d of all) {
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
    if (d.auto === 'yes') auto++;
  }
  return { total: all.length, byCategory, auto };
}
