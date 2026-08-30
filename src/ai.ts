/**
 * LinkFlow — AI provider (OmniRoute-compatible OpenAI endpoint, zero-cost default).
 *
 * Matches the memory note: IBE enrichment + seoflow use OmniRoute auto/best-free via
 * openai-compat (AI_PROVIDER=openai, BASE_URL=.../v1). LinkFlow reuses the same env
 * conventions so it works with the user's existing OmniRoute setup.
 *
 * Env vars (all optional, from .env.local):
 *   AI_PROVIDER        openai (default) | any
 *   AI_BASE_URL        e.g. http://192.168.0.254:20128/v1  (OmniRoute)
 *   AI_API_KEY         API key
 *   AI_MODEL           model name override
 */
import { loadConfig } from './config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

let _callCount = 0;
export function resetAiCallCount(): void { _callCount = 0; }
export function getAiCallCount(): number { return _callCount; }

/**
 * Chat completion against an OpenAI-compatible endpoint.
 * Returns text or null on failure.
 */
export async function aiChat(prompt: string, task: string, opts?: { system?: string; maxTokens?: number }): Promise<string | null> {
  const cfg = loadConfig();
  const max = cfg.ai?.maxCallsPerRun ?? 20;
  if (_callCount >= max) {
    console.log(`     ⚠️  AI budget: ${_callCount}/${max} calls used — skipping ${task}`);
    return null;
  }

  const baseUrl = (cfg.ai?.baseUrl || '').replace(/\/+$/, '');
  const apiKey = cfg.ai?.apiKey || 'sk-local';
  const model = cfg.ai?.model || 'auto/best-free';

  if (!baseUrl) {
    console.log('     ⚠️  No AI base URL configured — using template payload (no AI call).');
    return null;
  }

  const messages: ChatMessage[] = [];
  if (opts?.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts?.maxTokens ?? 600,
        temperature: 0.7,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`     ⚠️  AI error ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const text = await res.text();

    // Some providers (OmniRoute) stream SSE even when stream:false is requested.
    // Parse either a plain JSON body or an SSE stream of `data: {...}` lines.
    let data: any = null;
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      data = JSON.parse(trimmed);
    } else if (trimmed.includes('data:')) {
      // SSE stream — join the JSON payloads (the last `data: [DONE]`-style chunk
      // is a sentinel; use the first chunk with a real choice).
      for (const line of trimmed.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          if (chunk?.choices?.[0]?.delta?.content) {
            data = chunk;
            break;
          }
          if (chunk?.choices?.[0]?.message?.content) {
            data = chunk;
            break;
          }
        } catch {
          /* skip malformed chunk */
        }
      }
    } else {
      throw new Error('Unexpected response format');
    }

    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? null;
    if (!content) {
      console.log('     ⚠️  AI returned no content');
      return null;
    }
    _callCount++;
    return content;
  } catch (err) {
    console.log(`     ⚠️  AI request failed: ${(err as Error).message}`);
    return null;
  }
}

/** Retry wrapper for transient failures. */
export async function aiChatWithRetry(prompt: string, task: string, opts?: { system?: string; maxTokens?: number; retries?: number }): Promise<string | null> {
  const retries = opts?.retries ?? 2;
  for (let i = 0; i <= retries; i++) {
    const out = await aiChat(prompt, task, opts);
    if (out) return out;
    if (i < retries) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return null;
}
