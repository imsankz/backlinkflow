# BacklinkFlow — Agent Operating Guide

BacklinkFlow (npm `backlinkflow`, GitHub `imsankz/backlinkflow`, repo dir `linkflow/`) is a zero-cost
backlink & directory-submission engine: a vetted directory database, AI-tailored submission copy,
Playwright browser automation, and proof-of-submission reports. It is a CLI + library (ESM, Node ≥ 18, MIT) —
**not a SaaS, no accounts, no hosted content**. The user brings their own AI endpoint
(any OpenAI-compatible API; default OmniRoute). Open-source alternative to Submitator/ListingBott.

This file is the single source of truth for AI coding harnesses (Claude Code, Codex, Cursor, OpenCode, …).
Read it before operating on the repo. `CLAUDE.md` is a pointer for legacy Claude Code.

## Quick start

```bash
npm install          # deps; playwright chromium needed only for real submissions
npm run build        # esbuild transpile src/*.ts → dist/*.js (gitignored) + copy data/*.yaml
npm test             # node tests/run.js — must end "10 passed, 0 failed"
node bin/linkflow.js stats          # smoke: DB + badge counts
node bin/linkflow.js list --limit 5
```

The `bin/linkflow.js` launcher imports `dist/index.js` and **errors if dist is not built** — always
`npm run build` first. `npm run linkflow` and `npm run linkflow:dry` are convenience aliases.
The installed npm command is `backlinkflow`; repo-internal usage strings also say `backlinkflow`
(older header comments say `linkflow` — the rename was LinkFlow → BacklinkFlow; don't "fix" the old
name back in when editing).

## Commands (CLI verb = first non-flag arg; no verb → `list`)

| Command | What it does |
|---|---|
| `list [--category X] [--limit N]` | List directories in the database |
| `search <query>` | Search directories (name/notes) |
| `submit <site-url> [--dry-run] [--limit N] [--category X] [--go]` | Generate payloads + plan; `--go` actually submits via Playwright |
| `payload <site-url> [--directory X]` | AI-tailored payload only (no submission) |
| `status` | Submission tracker summary |
| `report` | Regenerate report from tracker |
| `stats` | Database stats |
| `db:review` | Flag DB quality issues (dead links, homepage-as-submit) |
| `db:regenerate` | Rebuild DB from source lists (runs `scripts/regenerate-db.py`) |
| `indexnow <url> [--skip-verify] [--urls a b c]` | Ping IndexNow + Google (needs hosted key file) |
| `awesome <owner/repo> --dry-run` | Generate awesome-list PR snippet (dry-run only) |
| `measure <url> [--json]` | Measure backlinks via free sources (Common Crawl) |
| `badge [list \| show <name> \| install --framework nextjs\|html\|astro]` | Badge registry + install snippets |
| `init` | Print config template |

## Config

- Per-site: `linkflow.config.json` in cwd — `siteName, siteUrl, siteDescription, tags, contentDomain,
  writingSample, ai {provider, baseUrl, apiKey, model, maxCallsPerRun}, pacing {minSeconds, perDay}`.
- Multi-site: `--config <file.json>`; working examples in `examples/linkflow.config.<site>.json`.
- Env overrides (`.env.local`, optional): `AI_PROVIDER` (default `openai`), `AI_BASE_URL` or
  `OMNITROUTE_BASE_URL`, `AI_API_KEY` or `OMNITROUTE_API_KEY`, `AI_MODEL`.
- **No AI config ⇒ template-payload fallback — never fail the run.** `maxCallsPerRun` (default 20)
  is the per-run AI call budget; a skip notice is printed when exhausted.
- The tool is GENERIC — per-site configs live in `examples/`, never hardcode a user's site into the CLI.
- Runtime state (gitignored): `.linkflow/` — `tracker.json`, `report.md`, `proofs/*.png`.

## Data files (ship in the npm package via package.json `files`)

- `data/directories.yaml` — the vetted DB (1,100+ entries; exact count from `stats`). Top-level keys are
  **free-form category names** (ai, saas, travel, startup, general, community, reddit, linkinbio, …);
  entries carry `name/submitUrl/type/auto|manual/lang/notes` (+ `dr`, `status`). Entry bar: the target
  gives a public, clickable link back to the submitted site — traditional directories AND DR trackers,
  link-in-bio platforms, subreddits, etc. qualify.
- `data/badges.yaml` — badge registry (name, badgeUrl, href, alt, width/height, dr, required, notes).
  Badge URLs are best-effort — verify they load before relying on them.
- **Regeneration is non-destructive (union-preserving)**: `db:regenerate` seeds from the current
  `directories.yaml` and merges the backlink-pilot baseline + external lists as net-new additions
  only. Curated entries win collisions — dead/paid flags, verified-dead reasons, notes, DR and
  source-less categories (`travel`, `dr-tracker`, `linkinbio`, …) are always preserved. The rebuild
  also dedupes within a category (name+domain and name+brand, keeping the first/curated copy) and
  normalizes YAML formatting (drops `#` comments), so the file is fully reproducible — run it twice
  and the second pass is byte-identical.
- **Dual-write rule (still recommended)**: curated categories/entries added to `directories.yaml`
  SHOULD be mirrored into `scripts/sources/backlink-pilot-targets.yaml` (snake_case fields there) so
  fresh builds and the baseline stay in sync. Entries are no longer silently lost on regen, but
  DELETING an entry requires removing it from BOTH files — a rebuild re-adds from the mirror anything
  missing from directories.yaml. Re-run the regen + `npm test` after touching either.
- Prefer **keeping entries with `status: dead/paid` + reason** over deleting them (user preference);
  liveness notes like `[verified dead: <reason>]` go in `notes`.
- When adding a shipped data file, add it to package.json `files` AND the `build.mjs` dist copy list.

## Architecture

```
bin/linkflow.js       launcher → imports dist/index.js (errors if not built)
src/index.ts          CLI entry: hand-rolled flag parsing (no yargs); command dispatch
src/database.ts       directories.yaml loader (cwd → dist → node_modules) + search + stats
src/payload.ts        AI/template payload generator (strict-JSON extraction, SSE-tolerant)
src/ai.ts             OpenAI-compatible client; handles SSE body even with stream:false
src/config.ts         linkflow.config.json + .env.local loader
src/tracker.ts        .linkflow/tracker.json (dedupe by directory)
src/report.ts         .linkflow/report.md proof report
src/indexnow.ts  awesome.ts  measure.ts  badges.ts   (v0.3–v0.5 commands)
src/engine/           browser.ts (Playwright launch/humanType), fields.ts (smart form detection),
                      adapters.ts (generic + site-specific), submit.ts (preflight → fill → verify → track)
scripts/regenerate-db.py   idempotent DB rebuild from scripts/sources/ (must stay idempotent)
build.mjs             esbuild TRANSPILE mode, multi-entry, recursive over src/** (NOT bundle), copies data/
tests/run.js          plain node test runner; snapshot-clean before AND after any test that writes state
```

## Engineering rules (repo gotchas)

- **ESM requires explicit `.js` extensions** on relative imports (`from './database.js'`) — esbuild does
  not rewrite them; missing extensions throw ERR_MODULE_NOT_FOUND at runtime.
- `build.mjs` must recurse into `src/` subdirs (`src/engine/`), and import `statSync` from 'fs'
  explicitly (`fs.statSync` throws — there is no `fs` namespace import).
- esbuild 0.28: `watch` is only valid via `context()` + `ctx.watch()`, never in `build()` options.
- Real submissions need Playwright chromium: `npx playwright install chromium`. Preflight the submit URL
  (fetch, 12s) before launching a browser to skip dead targets cheaply.
- Common Crawl (`measure`): HTTP 404 from the CDX API means *no captures* → treat as unavailable, not error.
- IndexNow: requires a UUID key hosted at `https://<host>/<key>.txt`; verify it fetches before pinging.
  Google sitemap ping often returns non-200 even when accepted — warn, don't fail.
- **README rename sweep**: after multi-row README edits, `grep -n '| \`linkflow'` and fix rows that
  flipped the command name back to the old `linkflow` form. Same for `llms.txt`.
- On macOS/CLI: no test/process daemons here — tests are plain node, no framework.

## Done = verified

`npm run build` → `npm test` green → exercise the touched command live. For AI/submit paths, run a
`--dry-run` against a real config + the live AI endpoint: template fallback output proves the no-AI
path, tailored copy proves the AI path. Claiming "works" without these = not done. Never
`git push` without being asked, and never force-push.

## Release checklist (when cutting a version)

1. Bump `version` in package.json; update README command table + `llms.txt` if the command surface changed.
2. `npm run build && npm test`.
3. `npm publish` is interactive (2FA) — the user runs it, or use an npm automation token.
   After publish, verify via `https://registry.npmjs.org/<name>/<version>` (registry CDN lags
   `npm view`/`npm install` by 30–60 s — don't "fix" by republishing).
