/**
 * LinkFlow — config loader.
 * Reads linkflow.config.json + .env.local (same conventions as seoflow).
 */
import fs from 'fs';
import path from 'path';
import type { LinkFlowConfig } from './types.js';

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export function loadConfig(configPathOverride?: string): LinkFlowConfig {
  const configPath = configPathOverride || path.join(process.cwd(), 'linkflow.config.json');
  let cfg: Partial<LinkFlowConfig> = {};
  if (fs.existsSync(configPath)) {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  const env = loadEnvLocal();
  // AI config: explicit env vars override config file
  return {
    ...cfg,
    ai: {
      provider: env.AI_PROVIDER || cfg.ai?.provider,
      baseUrl: env.AI_BASE_URL || env.OMNITROUTE_BASE_URL || cfg.ai?.baseUrl,
      apiKey: env.AI_API_KEY || env.OMNITROUTE_API_KEY || cfg.ai?.apiKey,
      model: env.AI_MODEL || cfg.ai?.model,
      maxCallsPerRun: cfg.ai?.maxCallsPerRun ?? 20,
    },
    pacing: cfg.pacing || { minSeconds: 60, perDay: 10 },
  } as LinkFlowConfig;
}

export function hasAiConfig(cfg: LinkFlowConfig): boolean {
  return Boolean(cfg.ai?.baseUrl && cfg.ai?.apiKey);
}

export function printConfigSummary(cfg: LinkFlowConfig): void {
  console.log('  site:', cfg.siteName || '(unset)');
  console.log('  url:', cfg.siteUrl || '(unset)');
  console.log('  ai provider:', cfg.ai?.provider || '(auto)');
  if (cfg.ai?.baseUrl) console.log('  ai baseUrl:', cfg.ai.baseUrl);
  console.log('  pacing:', `${cfg.pacing?.perDay ?? 10}/day, ${cfg.pacing?.minSeconds ?? 60}s apart`);
}
