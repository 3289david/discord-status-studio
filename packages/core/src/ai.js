// AI status designer powered by OpenRouter (https://openrouter.ai) — any model it
// routes to. Falls back to the offline generator (aesthetic.js) when no API key is
// configured or the call fails.
import { generate, restyle } from './aesthetic.js';
import { normalizePresence } from './presence.js';

export const DEFAULT_MODEL = 'openrouter/auto';
const API = 'https://openrouter.ai/api/v1';

const VARIANT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'activityType', 'details', 'state', 'largeImageEmoji', 'largeText', 'smallImageEmoji', 'smallText', 'customStatusEmoji', 'customStatusText', 'buttonLabel', 'buttonUrl', 'style'],
  properties: {
    name: { type: 'string', description: 'Activity name, 2-30 chars, e.g. "Coding Mode"' },
    activityType: { type: 'string', enum: ['playing', 'listening', 'watching', 'competing'] },
    details: { type: 'string', description: 'First line, <= 64 chars, usually starts with one emoji' },
    state: { type: 'string', description: 'Second line, <= 64 chars' },
    largeImageEmoji: { type: 'string', description: 'Exactly one emoji used as the large image' },
    largeText: { type: 'string' },
    smallImageEmoji: { type: 'string', description: 'One emoji for the small badge, or empty string' },
    smallText: { type: 'string' },
    customStatusEmoji: { type: 'string' },
    customStatusText: { type: 'string', description: 'Short lowercase custom status, <= 40 chars' },
    buttonLabel: { type: 'string', description: 'Button label <= 30 chars (with emoji), or empty string if no link was given' },
    buttonUrl: { type: 'string', description: 'https URL from the user input, or empty string' },
    style: { type: 'string', description: 'Short name of the visual style used' },
  },
};

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: { variants: { type: 'array', items: VARIANT_SCHEMA } },
};

const SYSTEM = `You design Discord Rich Presence statuses that look great on a Discord profile.

Rules for good-looking Discord statuses:
- Two visible lines: "details" (line 1) and "state" (line 2). Keep each under ~40 characters so nothing is truncated.
- Lead line 1 with a single fitting emoji. Never stack emojis or use more than two in total per line.
- Line 2 complements line 1 instead of repeating it (mood, progress, a witty aside, or a domain/link text).
- Use English by default for a clean look; use Korean only if the user explicitly asks for Korean text.
- Vary the styling between variants: e.g. plain emoji-lead, ALL CAPS header, box-drawing tree (┌─ / └─), unicode small caps, lowercase aesthetic with ✦, terminal prompt ("> coding_"), 【 brackets 】.
- If the user mentions a domain or URL, show it in the state line and add a button pointing to it (https). Otherwise leave button fields empty.
- Pick activityType sensibly: music → listening, video/anime → watching, otherwise playing.
- Never include slurs, sexual content, or impersonation of real brands' official accounts.

Respond with JSON only, matching this shape: {"variants":[{"name","activityType","details","state","largeImageEmoji","largeText","smallImageEmoji","smallText","customStatusEmoji","customStatusText","buttonLabel","buttonUrl","style"}]}`;

class AiError extends Error {}

export class AiDesigner {
  constructor({ apiKey, model = DEFAULT_MODEL, log = () => {}, fetch: fetchImpl } = {}) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.model = model || DEFAULT_MODEL;
    this.log = log;
    this.fetch = fetchImpl || globalThis.fetch;
  }

  get enabled() {
    return !!this.apiKey;
  }

  async chat(userContent, { structured = true } = {}) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
      temperature: 0.9,
      max_tokens: 4000,
    };
    if (structured) {
      body.response_format = { type: 'json_schema', json_schema: { name: 'discord_status_variants', strict: true, schema: RESULT_SCHEMA } };
    }
    const res = await this.fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/3289david/discord-status-studio',
        'X-Title': 'Discord Status Studio',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const status = json.error?.code || res.status;
      const msg = json.error?.message || `HTTP ${res.status}`;
      const err = new AiError(
        status === 401 ? 'OpenRouter API 키가 올바르지 않습니다.'
          : status === 402 ? 'OpenRouter 크레딧이 부족합니다.'
            : status === 429 ? 'OpenRouter 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.'
              : `OpenRouter 오류 (${status}): ${msg}`,
      );
      err.status = Number(status) || res.status;
      throw err;
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new AiError('AI 응답이 비어 있습니다.');
    return typeof content === 'string' ? content : content.map((c) => c.text || '').join('');
  }

  async ask(userContent, count) {
    let text;
    try {
      text = await this.chat(userContent, { structured: true });
    } catch (e) {
      // Not every model supports structured outputs — retry with plain JSON prompting.
      if (e.status === 400 || e.status === 404 || e.status === 422) text = await this.chat(userContent, { structured: false });
      else throw e;
    }
    const variants = parseVariants(text);
    if (!variants.length) throw new AiError('AI 응답을 해석하지 못했습니다.');
    return variants.slice(0, count).map(toPresence);
  }

  /** Free text ("게임 좋아하고 개발하는 사람 느낌") → presence variants. */
  async design(prompt, { count = 4 } = {}) {
    if (!this.enabled) return { source: 'local', variants: generate(prompt, { count }) };
    try {
      const variants = await this.ask(`Create ${count} different Discord status variants for this request:\n\n${prompt}`, count);
      return { source: 'ai', model: this.model, variants };
    } catch (e) {
      this.log('AI design failed, using offline generator:', e.message);
      return { source: 'local', error: e.message, variants: generate(prompt, { count }) };
    }
  }

  /** "Make it aesthetic": same meaning, new style. `avoid` = previously shown lines. */
  async aesthetic(presence, { step = 0, avoid = [] } = {}) {
    if (!this.enabled) return { source: 'local', variants: [restyle(presence, step)] };
    const p = normalizePresence(presence);
    try {
      const variants = await this.ask(
        `Restyle this Discord status. Keep the same meaning and topic, but give it a fresh aesthetic.\n` +
          `Current:\n- name: ${p.name}\n- details: ${p.details}\n- state: ${p.state}\n` +
          (avoid.length ? `Do not reuse these previous versions:\n${avoid.map((a) => `- ${a}`).join('\n')}\n` : '') +
          `Return exactly 1 variant.`,
        1,
      );
      // Keep the user's images/buttons/timestamps; only restyle the text.
      const v = variants[0];
      return {
        source: 'ai',
        model: this.model,
        variants: [normalizePresence({ ...p, name: v.name || p.name, details: v.details, state: v.state, customStatus: v.customStatus })],
      };
    } catch (e) {
      this.log('AI aesthetic failed:', e.message);
      return { source: 'local', error: e.message, variants: [restyle(presence, step)] };
    }
  }
}

/** Parse model output, tolerating ```json fences and prose around the JSON. */
export function parseVariants(text) {
  let data = null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  try {
    data = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        data = JSON.parse(cleaned.slice(start, end + 1));
      } catch {}
    }
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.variants) ? data.variants : data && typeof data === 'object' && data.details ? [data] : [];
  return list.filter((v) => v && typeof v === 'object' && (v.details || v.state || v.name));
}

/** Fetch the public OpenRouter model list (for the settings dropdown). */
export async function listModels(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${API}/models`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter 모델 목록을 불러오지 못했습니다 (HTTP ${res.status})`);
  const json = await res.json();
  return (json.data || []).map((m) => ({ id: m.id, name: m.name || m.id })).sort((a, b) => a.id.localeCompare(b.id));
}

const TYPE_MAP = { playing: 0, listening: 2, watching: 3, competing: 5 };
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function toPresence(v) {
  const url = str(v.buttonUrl);
  const buttons = /^https?:\/\//.test(url) ? [{ label: str(v.buttonLabel) || '🌐 Website', url }] : [];
  return normalizePresence({
    name: str(v.name),
    type: TYPE_MAP[v.activityType] ?? 0,
    details: str(v.details),
    state: str(v.state),
    largeImage: str(v.largeImageEmoji),
    largeText: str(v.largeText),
    smallImage: str(v.smallImageEmoji),
    smallText: str(v.smallText),
    buttons,
    timestamps: { mode: 'session' },
    customStatus: { emoji: str(v.customStatusEmoji), text: str(v.customStatusText) },
    _style: str(v.style),
  });
}
