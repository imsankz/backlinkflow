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

/** Coupon sentence appended to descriptions when the config carries one. */
export function couponSentence(cfg: LinkFlowConfig): string {
  if (!cfg.coupon?.code) return '';
  const discount = cfg.coupon.discount || 'a discount';
  const note = cfg.coupon.note ? ` ${cfg.coupon.note}` : '';
  return ` Use code ${cfg.coupon.code} for ${discount} at checkout.${note}`;
}

/** Template fallback — no AI call needed. */
export function templatePayload(dir: DirectoryEntry, cfg: LinkFlowConfig): Payload {
  const desc = (cfg.siteDescription || `${cfg.siteName} — ${cfg.contentDomain || 'a product'}.`) + couponSentence(cfg);
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
      email: cfg.siteEmail,
      ...(cfg.coupon?.code ? {
        couponCode: cfg.coupon.code,
        couponDiscount: cfg.coupon.discount || '',
        couponDiscountValue: cfg.coupon.discount?.match(/\d+/)?.[0] || '',
      } : {}),
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
    cfg.coupon?.code ? `Discount coupon: code ${cfg.coupon.code} gives ${cfg.coupon.discount} — mention it naturally in the description${cfg.coupon.note ? ` (${cfg.coupon.note})` : ''}.` : '',
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
    const desc = (data.description || '') + couponSentence(cfg);
    return {
      directory: dir.name,
      name: data.name || cfg.siteName,
      tagline: data.tagline || '',
      description: desc,
      category: data.category || dir.category,
      website: cfg.siteUrl,
      fields: {
        url: cfg.siteUrl,
        name: cfg.siteName,
        description: desc,
        email: cfg.siteEmail,
        ...(cfg.coupon?.code ? {
          couponCode: cfg.coupon.code,
          couponDiscount: cfg.coupon.discount || '',
          couponDiscountValue: cfg.coupon.discount?.match(/\d+/)?.[0] || '',
        } : {}),
      },
    };
  } catch {
    return null;
  }
}

export async function generatePayload(dir: DirectoryEntry, cfg: LinkFlowConfig): Promise<Payload> {
  const ai = await aiPayload(dir, cfg);
  return ai || templatePayload(dir, cfg);
}
