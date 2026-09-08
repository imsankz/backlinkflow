# BacklinkFlow

Operating instructions for AI coding agents live in **AGENTS.md** — read it first and follow it.
It is the canonical, harness-agnostic guide (build/test gate, command surface, config, data
dual-write rule, release checklist). Nothing here overrides it.

Quick recap: ESM, Node ≥ 18. `npm run build` (esbuild → `dist/`) is required before
`node bin/linkflow.js …` — the launcher errors if dist is missing. Verify with
`npm run build && npm test` (expect "10 passed, 0 failed").
