# BacklinkFlow — Sources & Credits

BacklinkFlow's directory database (`data/directories.yaml`) is an independent,
deduplicated compilation built by merging factual directory listings (site
names + submission URLs) from the open-source projects below.

**What we take:** factual data only — site name, submission URL, and (where
the source provided it) domain authority / price model / status.

**What we write ourselves:** all descriptions/notes are BacklinkFlow's own
(never copied verbatim from sources), plus the `auto`, `lang`, `category`,
and `status` enrichment fields.

Per-entry provenance is embedded in the data itself: entries carry a
`notes: [from <source>]` marker so any entry can be traced back here.

---

## Sources (11)

| # | Project | License | Used for |
|---|---------|---------|----------|
| 1 | [s87343472/backlink-pilot](https://github.com/s87343472/backlink-pilot) | MIT | Base target set (258 sites, richest metadata: `auto`/`status`/`notes`); architecture reference for the automation engine |
| 2 | [mmccaff/PlacesToPostYourStartup](https://github.com/mmccaff/PlacesToPostYourStartup) | CC0-1.0 | Subreddits + website launch platforms (from the canonical "Ask HN" thread) |
| 3 | [BossChow/ultimate-submit-list](https://github.com/BossChow/ultimate-submit-list) | no license | Top-100 directory table (names + submit links) |
| 4 | [theshubh77/awesome-saas-directories](https://github.com/theshubh77/awesome-saas-directories) | CC0-1.0 | SaaS launch platforms + submit links + DR |
| 5 | [rushout09/directory-submission-sites](https://github.com/rushout09/directory-submission-sites) | GPL-3.0 | 250+ site list (names + URLs only) |
| 6 | [best-of-ai/ai-directories](https://github.com/best-of-ai/ai-directories) | MIT | AI directories (names + URLs) |
| 7 | [submitdirectories/submitdirectories](https://github.com/submitdirectories/submitdirectories) | no license | AI/SaaS/Tool/Startup lists with DA + submit URLs |
| 8 | [nilandev/startup-directories](https://github.com/nilandev/startup-directories) | no license | Startup directories + subreddits |
| 9 | [mahseema/awesome-saas-directories](https://github.com/mahseema/awesome-saas-directories) | MIT | SaaS directories |
| 10 | [DirectorySurf/awesome-launch-platforms](https://github.com/DirectorySurf/awesome-launch-platforms) | MIT | Launch platforms |
| 11 | [volodstaimi/Startup-Launch-List](https://github.com/volodstaimi/Startup-Launch-List) | MIT | 580+ startup directory list (names + URLs) — entries live-verified; dead ones marked `status: dead` |

Also referenced for methodology (not data):
- [swyxio/launch-cheatsheet](https://github.com/swyxio/launch-cheatsheet) — launch playbooks (archived)
- [AIDevGTM/gtm-cofounder](https://github.com/AIDevGTM/gtm-cofounder) — GTM strategy skills
- [naxiaoduo/1000UserGuide](https://github.com/naxiaoduo/1000UserGuide) — original source backlink-pilot's `targets.yaml` derives from

---

## License notes

- **MIT sources** (backlink-pilot, best-of-ai, mahseema, DirectorySurf,
  Startup-Launch-List): attribution satisfied by this file.
- **CC0 sources** (mmccaff, theshubh77): public domain; credit retained as
  good practice.
- **GPL-3.0 source** (rushout09): only factual names/URLs are incorporated
  (facts are not copyrightable); no code or creative expression was taken.
  If you require strict GPL-cleanliness, remove the 4 unique entries from
  `directory-submission-sites` and regenerate (`linkflow db:regenerate`).
- **No-license sources** (BossChow, submitdirectories, nilandev): used for
  factual data only (names + URLs). If your legal review requires it, these
  can be dropped by removing the corresponding source files from
  `scripts/sources/` and regenerating.

## Regeneration

`scripts/regenerate-db.py` rebuilds the database from the vendored source
files in `scripts/sources/`. Delete a source file there → re-run
`linkflow db:regenerate` → that source's entries are gone.

BacklinkFlow itself is MIT (see LICENSE).
