/**
 * BacklinkFlow v0.3 — IndexNow URL pinger.
 *
 * Pings the free IndexNow API (https://api.indexnow.org/indexnow) which
 * forwards one POST to Bing, Yandex, Naver and Seznam. Google does not
 * consume IndexNow, so Google gets a separate sitemap ping via
 * https://www.google.com/ping?sitemap= (the legacy free endpoint).
 *
 * No API key needed: you generate a UUID as the host key and publish it as
 * a plain-text file at https://<host>/<key>.txt. This module generates the
 * key (or reads INDEXNOW_KEY from env / config) and verifies the key file is
 * published before submitting — it never hosts the file for you.
 */
import crypto from 'crypto';
import { loadConfig } from './config.js';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const GOOGLE_PING_ENDPOINT = 'https://www.google.com/ping';

export interface IndexNowResult {
  endpoint: string;
  statusCode: number;
  ok: boolean;
  submitted: number;
  engines: string[];
  responseBody?: string;
  error?: string;
}

export interface PingResult {
  indexnow: IndexNowResult | null;
  google: { ok: boolean; statusCode?: number; error?: string } | null;
  key: string;
  keyLocation: string;
  host: string;
}

/** Strip scheme/path from a site URL → bare host (no www normalization). */
export function toHost(url: string): string {
  return url
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^\/\//, '')
    .split(/[/?#]/)[0]
    .split('@')
    .pop()!
    .toLowerCase();
}

/** Load a configured IndexNow key: env > config.indexNow.key > generated. */
export function resolveIndexNowKey(cfg: ReturnType<typeof loadConfig>): string {
  const envKey = process.env.INDEXNOW_KEY;
  const cfgKey = (cfg as any).indexNow?.key;
  if (envKey) return envKey;
  if (cfgKey) return cfgKey;
  // Generate a fresh UUID per run — stable once saved to config.
  return crypto.randomUUID();
}

/** Build the key-file location URL for a host. */
export function keyLocationFor(host: string, key: string): string {
  return `https://${host}/${key}.txt`;
}

/** Fetch the published key file and confirm it matches. */
export async function verifyKeyPublished(keyLocation: string, key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(keyLocation, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 BacklinkFlow/0.3' },
    });
    if (res.status !== 200) return { ok: false, error: `keyLocation returned HTTP ${res.status}` };
    const body = (await res.text()).trim();
    if (body !== key) return { ok: false, error: 'keyLocation contents do not match key' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `fetch failed: ${(err as Error).message}` };
  }
}

/**
 * POST a URL list to the IndexNow umbrella endpoint.
 * IndexNow accepts 200/202 as success.
 */
export async function submitIndexNow(
  host: string,
  key: string,
  keyLocation: string,
  urls: string[]
): Promise<IndexNowResult> {
  const urlList = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (urlList.length === 0) {
    return { endpoint: INDEXNOW_ENDPOINT, statusCode: 0, ok: false, submitted: 0, engines: [], error: 'empty url list' };
  }
  if (urlList.length > 10000) {
    return { endpoint: INDEXNOW_ENDPOINT, statusCode: 0, ok: false, submitted: 0, engines: [], error: 'IndexNow caps batches at 10,000 URLs' };
  }
  // Every URL must belong to the declared host (IndexNow rejects cross-host).
  const crossHost = urlList.filter((u) => !u.includes(host));
  if (crossHost.length) {
    return { endpoint: INDEXNOW_ENDPOINT, statusCode: 0, ok: false, submitted: 0, engines: [], error: `${crossHost.length} URL(s) don't contain host ${host}: ${crossHost.slice(0, 3).join(', ')}` };
  }

  const payload = { host, key, keyLocation, urlList };
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'Mozilla/5.0 BacklinkFlow/0.3' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.text().catch(() => '');
    const ok = res.status === 200 || res.status === 202;
    return {
      endpoint: INDEXNOW_ENDPOINT,
      statusCode: res.status,
      ok,
      submitted: ok ? urlList.length : 0,
      engines: ['Bing', 'Yandex', 'Naver', 'Seznam'],
      responseBody: body.slice(0, 200) || undefined,
      error: ok ? undefined : `IndexNow rejected with HTTP ${res.status}: ${body.slice(0, 150)}`,
    };
  } catch (err) {
    return { endpoint: INDEXNOW_ENDPOINT, statusCode: 0, ok: false, submitted: 0, engines: [], error: `HTTP error: ${(err as Error).message}` };
  }
}

/** Ping Google's legacy sitemap endpoint (free, no key). */
export async function pingGoogleSitemap(sitemapUrl: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  try {
    const res = await fetch(`${GOOGLE_PING_ENDPOINT}?sitemap=${encodeURIComponent(sitemapUrl)}`, {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Mozilla/5.0 BacklinkFlow/0.3' },
    });
    return { ok: res.status === 200, statusCode: res.status, error: res.status === 200 ? undefined : `Google ping returned HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: `HTTP error: ${(err as Error).message}` };
  }
}

/** Default URL list for a host: homepage + sitemap. */
export function defaultUrls(host: string): string[] {
  return [`https://${host}/`, `https://${host}/sitemap.xml`];
}

/**
 * Full ping: verify key, submit to IndexNow, ping Google sitemap.
 * Returns null when the host is invalid (no config siteUrl and no arg).
 */
export async function pingSite(siteUrl: string, opts?: { urls?: string[]; skipVerify?: boolean }): Promise<PingResult> {
  const cfg = loadConfig();
  const host = toHost(siteUrl);
  const key = resolveIndexNowKey(cfg);
  const keyLocation = keyLocationFor(host, key);
  const urls = opts?.urls?.length ? opts.urls : defaultUrls(host);

  let keyOk = true;
  let keyError: string | undefined;
  if (!opts?.skipVerify) {
    const v = await verifyKeyPublished(keyLocation, key);
    keyOk = v.ok;
    keyError = v.error;
  }

  let indexnow: IndexNowResult | null = null;
  if (keyOk) {
    indexnow = await submitIndexNow(host, key, keyLocation, urls);
  } else {
    indexnow = {
      endpoint: INDEXNOW_ENDPOINT,
      statusCode: 0,
      ok: false,
      submitted: 0,
      engines: [],
      error: keyError || 'key verification failed',
    };
  }

  const google = await pingGoogleSitemap(`https://${host}/sitemap.xml`);

  return { indexnow, google, key, keyLocation, host };
}
