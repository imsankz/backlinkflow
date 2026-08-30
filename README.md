<div align="center">

# BacklinkFlow

**Zero-cost backlink & directory submission engine for indie hackers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green.svg)](./package.json)
[![Part of the flow series](https://img.shields.io/badge/flow--series-BacklinkFlow%20%7C%20SeoFlow%20%7C%20SECflow-blueviolet)](#the-flow-series)

*1,123 vetted directories · AI-tailored submission copy · Playwright browser automation · proof-of-submission reports — no SaaS, no credits, no $79 upsell.*

</div>

---

> **TL;DR** — Submitator, ListingBott, BoringLaunch charge $29–499 to do what BacklinkFlow does for free: a curated directory list, AI-generated per-directory copy, browser automation, and a status report. The only thing you bring is your own AI endpoint (OmniRoute, OpenAI, or any OpenAI-compatible API). Live-verified. MIT licensed.

**The what:**

| | What it does | How |
|---|---|---|
| **Database** | 1,123 directories across 9 categories (SaaS, AI, travel, startup, general, community, reddit, etc.) | Merged from 11 open-source lists, deduped, live-verified |
| **AI copy** | Per-directory tagline + description matching your site's voice | Your AI endpoint (OpenAI-compatible) |
| **Automation** | Real browser submissions via Playwright (`--go`) | Headless Chromium + smart field detection |
| **Proof** | Screenshots + per-directory markdown report | `.linkflow/report.md` + `.linkflow/proofs/*.png` |
| **Curation** | `db:review` flags dead links / homepage-as-submit | Idempotent regeneration from sources |
| **Cost** | $0 (you provide the AI endpoint, typically free) | No paid APIs, no SaaS subscription |

---

## Why BacklinkFlow?

Every paid directory-submission service is the same three things wrapped in a dashboard:

1. **A list of where to submit** — this is open data
2. **Per-directory copy** — this is a 5-line AI call
3. **A status report** — this is a JSON file + a markdown table

BacklinkFlow gives you all three, plus actual browser automation for sites with open forms. The moat is honesty: 876 directories live-verified, 221 marked dead with reason, 26 marked paid. No padding with self-owned link farms. No "AI" that means "Army of Indians."

**vs competitors:**

| | BacklinkFlow | Submitator | ListingBott | BoringLaunch |
|---|---|---|---|---|
| Directories | 1,123 (876 alive) | ~150 | ~250 | ~200 |
| Cost | $0 | $29–79 | $499 | $249 |
| Time to submit | 24–48h (with `--go`) | 24–48h | 1 month | 7 days |
| Your AI endpoint | ✅ | ❌ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ |
| Source list | ✅ CREDITS.md | ❌ proprietary | ❌ | ❌ |
| Badges handled | manual (v0.3) | ✅ | ✅ | ❌ |
| Open source | ✅ MIT | ❌ | ❌ | ❌ |

---

## Install

```bash
# from source
git clone https://github.com/imsankz/backlinkflow.git
cd linkflow && npm install && npm run build

# or (when published)
npm install -g linkflow
```

## Quick start

```bash
# 1. Create config
backlinkflow init

# 2. Edit linkflow.config.json + .env.local (AI endpoint)
#    AI_BASE_URL=http://192.168.0.254:20128/v1  (OmniRoute)
#    AI_API_KEY=...  AI_MODEL=auto/best-free

# 3. Explore the database
backlinkflow stats
backlinkflow list --category startup --limit 10
backlinkflow search "product hunt"

# 4. Generate AI-tailored submission copy (no submission)
backlinkflow payload https://yoursite.com --directory "Future Tools"

# 5. Plan submissions (dry-run — nothing recorded)
backlinkflow submit https://yoursite.com --dry-run --limit 10

# 6. Real automation — Playwright browser submits for you
backlinkflow submit https://yoursite.com --go --limit 10

# 7. Track + report
backlinkflow status
backlinkflow report   # → .linkflow/report.md (Submitator-style proof)
```

## Multiple sites, one tool

BacklinkFlow is generic — bring your own site config. Each product = one config file:

```bash
# SaaS product
backlinkflow submit https://kreatorlane.com --config examples/linkflow.config.kreatorlane.json --category startup --go --limit 5

# Travel blog
backlinkflow submit https://chasingwhereabouts.com --config examples/linkflow.config.chasingwhereabouts.json --category travel --go --limit 5
```

No hardcoded sites. Examples in `examples/`.

---

## Commands

| Command | Description |
|---|---|
| `backlinkflow list [--category X] [--limit N]` | List directories in the database |
| `backlinkflow search <query>` | Search directories by name/notes/URL |
| `backlinkflow submit <url> [--dry-run] [--limit N] [--category X] [--go] [--config file.json]` | Generate payloads + submit. `--go` = real Playwright automation |
| `backlinkflow payload <url> [--directory X]` | AI-tailored submission copy only |
| `backlinkflow status` | Tracker summary (submitted/pending/failed) |
| `backlinkflow report` | Regenerate proof-of-submission report |
| `backlinkflow stats` | Database stats (counts by category, alive/dead) |
| `backlinkflow db:review` | Flag DB quality issues (dead links, homepage-as-submit) |
| `backlinkflow db:regenerate` | Rebuild DB from source lists |
| `backlinkflow init` | Write config template |

---

## Database

```
ai: 331   startup: 612   general: 80   travel: 26
ai-zh: 33  general-zh: 14  community: 13  reddit: 10  awesome: 4
TOTAL: 1,123  ·  auto-submittable: 183  ·  alive: 876  ·  dead: 221  ·  paid: 26
```

Every URL was **live-verified** via concurrent HTTP + DNS resolution — 76 truly dead (DNS), 79 with dead submit paths (HTTP 404), 6 connection refused, 29 timeout-confirmed. Soft-errors (402/500/526) are flagged but not killed (may be transient).

**Source coverage** (11 lists, all credited in [CREDITS.md](./CREDITS.md)):

| Source | Stars | Type |
|---|---|---|
| [s87343472/backlink-pilot](https://github.com/s87343472/backlink-pilot) | ⭐348 | Base target set (rich metadata) |
| [mmccaff/PlacesToPostYourStartup](https://github.com/mmccaff/PlacesToPostYourStartup) | ⭐6,881 | Canonical "Ask HN" directory list |
| [theshubh77/awesome-saas-directories](https://github.com/theshubh77/awesome-saas-directories) | ⭐56 | SaaS launch platforms |
| [best-of-ai/ai-directories](https://github.com/best-of-ai/ai-directories) | ⭐868 | AI tool directories |
| [volodstaimi/Startup-Launch-List](https://github.com/volodstaimi/Startup-Launch-List) | ⭐8 | 580+ startup directories |
| [BossChow/ultimate-submit-list](https://github.com/BossChow/ultimate-submit-list) | ⭐151 | Top-100 directory table |
| [rushout09/directory-submission-sites](https://github.com/rushout09/directory-submission-sites) | ⭐12 | 250+ free sites |
| [submitdirectories/submitdirectories](https://github.com/submitdirectories/submitdirectories) | ⭐9 | AI/SaaS/Tool/Startup lists |
| [nilandev/startup-directories](https://github.com/nilandev/startup-directories) | ⭐26 | Subreddits + directories |
| [mahseema/awesome-saas-directories](https://github.com/mahseema/awesome-saas-directories) | ⭐242 | SaaS directories |
| [DirectorySurf/awesome-launch-platforms](https://github.com/DirectorySurf/awesome-launch-platforms) | ⭐252 | Launch platforms |

Per-entry provenance is in the data itself: `notes: [from <source>]` in the YAML.

---

## Configuration

`linkflow.config.json`:

```json
{
  "siteName": "My Product",
  "siteUrl": "https://example.com",
  "siteDescription": "A short, honest description.",
  "tags": ["saas", "devtools"],
  "contentDomain": "SaaS product",
  "writingSample": "2-3 sentences in your site voice",
  "ai": {
    "provider": "openai",
    "baseUrl": "http://192.168.0.254:20128/v1",
    "apiKey": "your-omniroute-key",
    "model": "auto/best-free",
    "maxCallsPerRun": 20
  },
  "pacing": { "minSeconds": 60, "perDay": 10 }
}
```

`.env.local` (overrides config):

```bash
AI_PROVIDER=openai
AI_BASE_URL=http://192.168.0.254:20128/v1
AI_API_KEY=sk-...
AI_MODEL=auto/best-free
```

Works with any OpenAI-compatible endpoint:
- [OmniRoute](https://github.com/...) (free, local)
- OpenAI, Anthropic, Groq, OpenRouter
- LM Studio, Ollama, vLLM (local)
- Any custom server

The AI client is **SSE-tolerant** — works with providers that stream even when `stream: false` is requested (OmniRoute).

---

## Database curation

The directory database is the product's moat. `scripts/regenerate-db.py` rebuilds it idempotently from the 11 source lists (annotated `[from <source>]`). `backlinkflow db:review` flags quality issues.

**Review verdict:**
- **1,123 entries**, 9 categories — full coverage from all 11 sources
- **876 verified alive** — every URL live-checked via `scripts/check-urls.py` (concurrent HTTP + DNS verification)
- **221 verified dead** — marked `status: dead` with reason
- **26 paid** — carry explicit `status: paid`
- **183 auto-submittable** (real form adapters via Playwright)
- **~420 "homepage-as-submit"** flags are alive directories whose real submit pages need discovery — ongoing curation task

**Curation workflow:**

```bash
python3 scripts/check-urls.py /tmp/linkflow-urls.txt   # live-check all URLs
python3 scripts/apply-urlcheck.py                      # mark verified-dead in DB
backlinkflow db:review                                     # see remaining flags
backlinkflow db:regenerate                                 # rebuild from sources (idempotent)
backlinkflow stats                                         # confirm counts
```

---

## The flow series

BacklinkFlow is the third in a series of zero-cost CLI tools, all MIT, all npm-published:

| Tool | Job | Engines | npm |
|---|---|---|---|
| **[SECflow](https://github.com/imsankz/SECflow)** | Security scanning for AI-driven repos | gitleaks, trivy, npm audit, custom regex | [`secflow`](https://www.npmjs.com/package/secflow) |
| **[SeoFlow](https://github.com/imsankz/seoflow)** | AI-powered SEO pipeline (audit, internal links, content gen, GSC) | GSC, PSI, Pexels, Ubersuggest, 6 LLMs | [`seoflow`](https://www.npmjs.com/package/seoflow) |
| **[BacklinkFlow](https://github.com/imsankz/backlinkflow)** | Backlink & directory submission automation | Your AI endpoint + Playwright | [`backlinkflow`](https://www.npmjs.com/package/backlinkflow) (this repo) |

Same DNA across all three: **free engines + your own AI agent as the "smart" layer + npm-published + zero-cost.**

---

## Architecture

```
backlinkflow submit <url> --go
        ↓
   config loader (linkflow.config.json + .env.local)
        ↓
   payload generator (AI + template fallback)
        ↓
   database (1,123 directories, 9 categories)
        ↓
   for each target:
        ↓
   preflight HTTP check ── dead ──→ mark failed
        ↓
   launch Chromium ──→ navigate submit URL
        ↓
   detect fields (name/url/email/description)
        ↓
   site adapter (generic | saashub | ph)
        ↓
   fill + submit
        ↓
   verify (success message, redirect)
        ↓
   screenshot → .linkflow/proofs/
        ↓
   record → .linkflow/tracker.json
        ↓
   report → .linkflow/report.md
        ↓
   pacing → next directory (per-day limit)
```

```
src/
  index.ts                # CLI entry
  config.ts               # config + .env loader
  database.ts             # YAML loader + search
  payload.ts              # AI + template payload gen
  ai.ts                   # OpenAI-compat client (SSE-tolerant)
  tracker.ts              # submission history
  report.ts               # proof-of-submission markdown
  types.ts                # shared interfaces
  engine/
    browser.ts            # Playwright wrapper
    fields.ts             # smart field detection
    adapters.ts           # site-specific + generic adapter
    submit.ts             # orchestration: preflight → fill → verify

data/directories.yaml     # 1,123 vetted directories
scripts/
  regenerate-db.py        # idempotent DB rebuild
  review-db.py            # quality flagger
  check-urls.py           # live URL checker
  apply-urlcheck.py       # mark verified-dead
  sources/                # 18 vendored source files
examples/                 # 2 example site configs
```

---

## Roadmap

- [x] **v0.1** — directory DB, AI payloads, tracker, reports
- [x] **v0.2** — Playwright automation engine (`--go`), site adapters, pacing, proof screenshots
- [ ] **v0.3** — GitHub awesome-list PR generator, IndexNow pings
- [ ] **v0.4** — seoflow integration (measure backlinks before/after submission)
- [ ] **v0.5** — Badge-handling component (the Submitator moat we haven't replicated)

---

## License

MIT (see [LICENSE](./LICENSE)). Source data compiled from 11 open-source projects — see [CREDITS.md](./CREDITS.md) for per-source licenses and provenance.

---

## ☕ Support

BacklinkFlow is free forever. If it saves you $79 (or 40 hours), [buy me a coffee](https://ko-fi.com/chasingwhereabouts) — it funds more free tools.
