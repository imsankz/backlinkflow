#!/usr/bin/env node
/**
 * LinkFlow CLI launcher.
 * Resolves the built dist/index.js and runs it as the CLI.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prefer dist build; fall back to src via tsx if not built (dev mode)
try {
  await import(path.join(__dirname, '..', 'dist', 'index.js'));
} catch (err) {
  if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_REQUIRE_ESM') {
    console.error('LinkFlow: dist not built. Run `npm run build` first.');
    process.exit(1);
  }
  throw err;
}
