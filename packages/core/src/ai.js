// AI status designer powered by Claude. Falls back to the offline generator
// (aesthetic.js) when no API key is configured or the call fails.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { generate, restyle } from './aesthetic.js';
import { normalizePresence } from './presence.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const Variant = z.object({
  name: z.string().describe('Activity name, 2-30 chars, e.g. "Coding Mode"'),
  activityType: z.enum(['playing', 'listening', 'watching', 'competing']),
  details: z.string().describe('First line, <= 64 chars, usually starts with one emoji'),
  state: z.string().describe('Second line, <= 64 chars'),
  largeImageEmoji: z.string().describe('Exactly one emoji used as the large image'),
  largeText: z.string(),
  smallImageEmoji: z.string().describe('One emoji for the small badge, or empty string'),
  smallText: z.string(),
  customStatusEmoji: z.string(),
  customStatusText: z.string().describe('Short lowercase custom status, <= 40 chars'),
  buttonLabel: z.string().describe('Button label <= 30 chars (with emoji), or empty string if no link was given'),
  buttonUrl: z.string().describe('https URL from the user input, or empty string'),
  style: z.string().describe('Short name of the visual style used'),
});

const Result = z.object({ variants: z.array(Variant) });

const SYSTEM = `You design Discord Rich Presence statuses that look great on a Discord profile.

Rules for good-looking Discord statuses:
- Two visible lines: "details" (line 1) and "state" (line 2). Keep each under ~40 characters so nothing is truncated.
- Lead line 1 with a single fitting emoji. Never stack emojis or use more than two in total per line.
- Line 2 complements line 1 instead of repeating it (mood, progress, a witty aside, or a domain/link text).
- Use English by default for a clean look; use Korean only if the user explicitly asks for Korean text.
- Vary the styling between variants: e.g. plain emoji-lead, ALL CAPS header, box-drawing tree (┌─ / └─), unicode small caps, lowercase aesthetic with ✦, terminal prompt ("> coding_"), 【 brackets 】.
- If the user mentions a domain or URL, show it in the state line and add a button pointing to it (https). Otherwise leave button fields empty.
- Pick activityType sensibly: music → listening, video/anime → watching, otherwise playing.
- Never include slurs, sexual content, or impersonation of real brands' official accounts.`;

export class AiDesigner {
  constructor({ apiKey, model = DEFAULT_MODEL, log = () => {}, fetch } = {}) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
    this.log = log;
    apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey, ...(fetch ? { fetch } : {}) }) : null;
  }

  get enabled() {
    return !!this.client;
  }

  async ask(userContent, count) {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(Result) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });
    if (response.stop_reason === 'refusal') throw new Error('AI가 이 요청을 처리하지 않았습니다.');
    const parsed = response.parsed_output;
    if (!parsed?.variants?.length) throw new Error('AI 응답을 해석하지 못했습니다.');
    return parsed.variants.slice(0, count).map(toPresence);
  }

  /** Free text ("게임 좋아하고 개발하는 사람 느낌") → presence variants. */
  async design(prompt, { count = 4 } = {}) {
    if (!this.client) return { source: 'local', variants: generate(prompt, { count }) };
    try {
      const variants = await this.ask(
        `Create ${count} different Discord status variants for this request:\n\n${prompt}`,
        count,
      );
      return { source: 'ai', variants };
    } catch (e) {
      this.log('AI design failed, using offline generator:', errorMessage(e));
      return { source: 'local', error: errorMessage(e), variants: generate(prompt, { count }) };
    }
  }

  /** "Make it aesthetic": same meaning, new style. `avoid` = previously shown lines. */
  async aesthetic(presence, { step = 0, avoid = [] } = {}) {
    if (!this.client) return { source: 'local', variants: [restyle(presence, step)] };
    const p = normalizePresence(presence);
    try {
      const variants = await this.ask(
        `Restyle this Discord status. Keep the same meaning and topic, but give it a fresh aesthetic.\n` +
          `Current:\n- name: ${p.name}\n- details: ${p.details}\n- state: ${p.state}\n` +
          (avoid.length ? `Do not reuse these previous versions:\n${avoid.map((a) => `- ${a}`).join('\n')}\n` : '') +
          `Return 1 variant.`,
        1,
      );
      // Keep the user's images/buttons/timestamps; only restyle the text.
      const v = variants[0];
      return {
        source: 'ai',
        variants: [normalizePresence({ ...p, name: v.name || p.name, details: v.details, state: v.state, customStatus: v.customStatus })],
      };
    } catch (e) {
      this.log('AI aesthetic failed:', errorMessage(e));
      return { source: 'local', error: errorMessage(e), variants: [restyle(presence, step)] };
    }
  }
}

function errorMessage(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Anthropic API 키가 올바르지 않습니다.';
  if (e instanceof Anthropic.RateLimitError) return 'API 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
  if (e instanceof Anthropic.APIConnectionError) return 'Anthropic API에 연결할 수 없습니다.';
  if (e instanceof Anthropic.APIError) return `API 오류 (${e.status}): ${e.message}`;
  return e?.message || String(e);
}

const TYPE_MAP = { playing: 0, listening: 2, watching: 3, competing: 5 };

function toPresence(v) {
  const buttons = v.buttonUrl && /^https?:\/\//.test(v.buttonUrl) ? [{ label: v.buttonLabel || '🌐 Website', url: v.buttonUrl }] : [];
  return normalizePresence({
    name: v.name,
    type: TYPE_MAP[v.activityType] ?? 0,
    details: v.details,
    state: v.state,
    largeImage: v.largeImageEmoji,
    largeText: v.largeText,
    smallImage: v.smallImageEmoji,
    smallText: v.smallText,
    buttons,
    timestamps: { mode: 'session' },
    customStatus: { emoji: v.customStatusEmoji, text: v.customStatusText },
    _style: v.style,
  });
}
