/**
 * LinkFlow — payload generator.
 * Produces per-directory submission payloads (tagline, description, category) —
 * AI-tailored when configured, template-based otherwise (zero-cost fallback).
 */
import type { DirectoryEntry, LinkFlowConfig, Payload } from './types.js';
import { aiChatWithRetry } from './ai.js';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Template fallback — no AI call needed. */
export function templatePayload(dir: DirectoryEntry, cfg: LinkFlowConfig): Payload {
  const desc = cfg.siteDescription || `${cfg.siteName} — ${cfg.contentDomain || 'a product'}.`;
  return {
    directory: dir.name,
    name: cfg.siteName,
    tagline: desc.split('.')[0].slice(0, 60),
    description: desc,
    category: dir.category,
    website: cfg.siteUrl,
    fields: {
      url: cfg.siteUrl,
      name: cfg.siteName,
      description: desc,
    },
  };
}

/** AI-tailored payload — uses the site's writing sample for voice consistency. */
export async function aiPayload(dir: DirectoryEntry, cfg: LinkFlowConfig): Promise<Payload | null> {
  const sys = `You are a launch-copy specialist. Write a concise, honest submission for a directory. Output ONLY valid JSON with keys: name, tagline, description, category. Description: 2-3 sentences, no hype, no buzzwords, include what it is and who it's for.`;

  const prompt = [
    `Directory: ${dir.name} (${dir.category})`,
    `Submit URL: ${dir.submitUrl}`,
    `Site: ${cfg.siteName}`,
    `URL: ${cfg.siteUrl}`,
    `About: ${cfg.siteDescription || '(none provided)'}`,
    cfg.tags?.length ? `Tags: ${cfg.tags.join(', ')}` : '',
    cfg.writingSample ? `Writing sample (match this voice):\n${cfg.writingSample.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n');

  const raw = await aiChatWithRetry(prompt, `payload-${slugify(dir.name)}`, {
    system: sys,
    maxTokens: 400,
  });
  if (!raw) return null;

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const data = JSON.parse(m[0]);
    return {
      directory: dir.name,
      name: data.name || cfg.siteName,
      tagline: data.tagline || '',
      description: data.description || '',
      category: data.category || dir.category,
      website: cfg.siteUrl,
    };
  } catch {
    return null;
  }
}

export async function generatePayload(dir: DirectoryEntry, cfg: LinkFlowConfig): Promise<Payload> {
  const ai = await aiPayload(dir, cfg);
  return ai || templatePayload(dir, cfg);
}
