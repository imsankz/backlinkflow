/**
 * LinkFlow — build script (mirrors seoflow's build.mjs)
 * Compiles TypeScript to dist/ using esbuild, then copies assets.
 * Each src/*.ts becomes dist/*.js (transpile-only, no bundle) so the CLI
 * and library consumers can import individual modules.
 */
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const entries = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f);
    if (statSync(full).isDirectory()) walk(full);
    else if (f.endsWith('.ts')) entries.push(full);
  }
})(path.join(root, 'src'));

const watch = process.argv.includes('--watch');

const buildOpts = {
  entryPoints: entries,
  bundle: false,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outdir: dist,
  sourcemap: true,
};

if (watch) {
  const ctx = await context(buildOpts);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(buildOpts);
}

// Copy YAML database into dist so the CLI can find it at runtime
cpSync(path.join(root, 'data', 'directories.yaml'), path.join(dist, 'directories.yaml'));

console.log('LinkFlow build complete → dist/');
