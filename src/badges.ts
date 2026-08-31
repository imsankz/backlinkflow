/**
 * BacklinkFlow v0.5 — badge handling.
 * Loads the badge registry, generates badge HTML, and produces
 * install instructions for common site frameworks (Next.js, plain HTML).
 *
 * The badge moat: high-DR directories (Turbo0 DR80, StartupFame DR83, ...)
 * require displaying their badge to accept your listing. BacklinkFlow
 * generates the exact snippet + shows where to put it — no manual hunting.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Badge {
  name: string;
  badgeUrl: string;
  href: string;
  alt: string;
  width: number;
  height: number;
  dr?: number;
  required?: boolean;
  notes?: string;
}

let _cache: Badge[] | null = null;

/** Resolve badges.yaml path (source or bundled in dist/). */
function resolveBadgesPath(): string {
  const candidates = [
    path.join(process.cwd(), 'data', 'badges.yaml'),
    path.join(__dirname, 'badges.yaml'),
    path.join(__dirname, '..', 'data', 'badges.yaml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('BacklinkFlow: badges.yaml not found.');
}

export function loadBadges(): Badge[] {
  if (_cache) return _cache;
  const raw = fs.readFileSync(resolveBadgesPath(), 'utf8');
  _cache = yaml.load(raw) as Badge[];
  return _cache;
}

/** Find a badge by directory name (fuzzy). */
export function findBadge(nameOrUrl: string): Badge | undefined {
  const q = nameOrUrl.toLowerCase();
  return loadBadges().find(
    (b) => b.name.toLowerCase().includes(q) || q.includes(b.name.toLowerCase())
  );
}

/** Sort by DR desc, required first. */
export function sortedBadges(): Badge[] {
  return [...loadBadges()].sort((a, b) => {
    if ((b.required ? 1 : 0) !== (a.required ? 1 : 0)) return (b.required ? 1 : 0) - (a.required ? 1 : 0);
    return (b.dr || 0) - (a.dr || 0);
  });
}

/** Generate HTML for a badge. */
export function badgeHtml(b: Badge, opts?: { rel?: string }): string {
  const rel = opts?.rel || 'noopener noreferrer';
  return `<a href="${b.href}" target="_blank" rel="${rel}" title="${b.alt}">
  <img src="${b.badgeUrl}" alt="${b.alt}" width="${b.width}" height="${b.height}" loading="lazy" />
</a>`;
}

/** Generate a Next.js component snippet (JSX) for a badge. */
export function badgeJsx(b: Badge): string {
  return `{/* ${b.name} badge — required for listing */}
<a href="${b.href}" target="_blank" rel="noopener noreferrer" title="${b.alt}">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src="${b.badgeUrl}" alt="${b.alt}" width="${b.width}" height="${b.height}px" loading="lazy" />
</a>`;
}

/** Produce install instructions for a framework. */
export function installInstructions(badges: Badge[], framework: 'nextjs' | 'html' | 'astro' | 'unknown'): string {
  const lines: string[] = [];
  const required = badges.filter((b) => b.required);
  const optional = badges.filter((b) => !b.required);

  lines.push(`# Badge installation (${framework})`);
  lines.push('');
  lines.push(`You have ${badges.length} badges: ${required.length} required, ${optional.length} optional.`);
  lines.push('');
  if (required.length) {
    lines.push(`## Required badges (for directory acceptance)`);
    lines.push('');
    for (const b of required) {
      lines.push(`### ${b.name} (DR ${b.dr})${b.notes ? ` — ${b.notes}` : ''}`);
      lines.push('');
      lines.push(badgeHtml(b));
      lines.push('');
      lines.push('```html');
      lines.push(badgeHtml(b));
      lines.push('```');
      lines.push('');
    }
  }
  if (optional.length) {
    lines.push(`## Optional badges (boost DR further)`);
    lines.push('');
    for (const b of optional) {
      lines.push(`- ${b.name} (DR ${b.dr})${b.notes ? ` — ${b.notes}` : ''}`);
    }
    lines.push('');
  }

  lines.push(`## Where to install`);
  lines.push('');
  switch (framework) {
    case 'nextjs':
      lines.push(`Add the badges to your global layout footer. Create \`components/Badges.tsx\` and include it in \`app/layout.tsx\`:`);
      lines.push('');
      lines.push('```tsx');
      lines.push(`import Badges from '@/components/Badges';`);
      lines.push(`// inside <body>: <Badges />`);
      lines.push('```');
      lines.push('');
      lines.push('The component renders the required badges inline (see the JSX snippets above).');
      break;
    case 'astro':
      lines.push(`Add to \`src/components/Badges.astro\` and include in your layout footer.`);
      break;
    case 'html':
      lines.push(`Paste the HTML snippets into your footer (before </footer> or </body>).`);
      break;
    default:
      lines.push(`Add the HTML snippets to your site footer. The exact location depends on your framework.`);
  }
  lines.push('');
  lines.push(`## Notes`);
  lines.push(`- Keep badges visible (Submitator tried invisible badges and cancelled them — they hurt more than help).`);
  lines.push(`- Badge URLs are best-effort; verify they load before submitting. If a badge 404s, remove it and re-check the directory.`);

  return lines.join('\n');
}
