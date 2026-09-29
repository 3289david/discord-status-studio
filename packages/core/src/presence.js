// Presence model shared by every app. A "presence" is what the user edits in the UI;
// toRpcActivity / toGatewayActivity convert it into what Discord actually accepts.

export const ACTIVITY_TYPES = {
  playing: 0,
  streaming: 1,
  listening: 2,
  watching: 3,
  custom: 4,
  competing: 5,
};

export const ACTIVITY_LABELS = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  4: '',
  5: 'Competing in',
};

// status_display_type: which field Discord shows in the member list ("Playing X").
export const STATUS_DISPLAY = { name: 0, state: 1, details: 2 };

export const TIMESTAMP_MODES = ['none', 'session', 'app', 'countdown', 'clock', 'custom'];

export function emptyPresence() {
  return {
    name: '',
    type: 0,
    details: '',
    state: '',
    largeImage: '',
    largeText: '',
    smallImage: '',
    smallText: '',
    buttons: [],
    timestamps: { mode: 'session', minutes: 25, start: '' },
    party: { enabled: false, size: 1, max: 4 },
    statusDisplay: 'name',
    appProfile: '',
    userStatus: 'online',
    customStatus: { emoji: '', text: '' },
  };
}

export function normalizePresence(input = {}) {
  const base = emptyPresence();
  const p = { ...base, ...input };
  p.type = Number.isInteger(Number(p.type)) ? Number(p.type) : 0;
  for (const k of ['name', 'details', 'state', 'largeImage', 'largeText', 'smallImage', 'smallText', 'appProfile', 'statusDisplay', 'userStatus']) {
    p[k] = typeof p[k] === 'string' ? p[k] : String(p[k] ?? '');
  }
  p.buttons = Array.isArray(p.buttons)
    ? p.buttons
        .filter((b) => b && (b.label || b.url))
        .slice(0, 2)
        .map((b) => ({ label: String(b.label ?? ''), url: String(b.url ?? '') }))
    : [];
  p.timestamps = { ...base.timestamps, ...(input.timestamps || {}) };
  p.party = { ...base.party, ...(input.party || {}) };
  p.customStatus = { ...base.customStatus, ...(input.customStatus || {}) };
  return p;
}

const BLANK = '⠀'; // braille blank — Discord rejects 1-char fields, this pads invisibly

export function fitText(value, max = 128) {
  if (value == null) return undefined;
  let s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  const chars = Array.from(s);
  if (chars.length > max) s = chars.slice(0, max - 1).join('') + '…';
  if (Array.from(s).length < 2) s = s + BLANK;
  return s;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️\u{1F3FB}-\u{1F3FF}⃣#*0-9])+$/u;

export function isEmojiOnly(s) {
  return typeof s === 'string' && s.trim().length > 0 && EMOJI_ONLY.test(s.trim()) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
}

// Any emoji can be used as a Rich Presence image through the Twemoji CDN.
export function twemojiUrl(emoji) {
  const cps = Array.from(emoji.trim())
    .map((c) => c.codePointAt(0).toString(16))
    .filter((cp) => cp !== 'fe0f');
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${cps.join('-')}.png`;
}

export function resolveImage(value) {
  const v = (value || '').trim();
  if (!v) return undefined;
  if (isEmojiOnly(v)) return twemojiUrl(v);
  return v; // http(s) URL or Discord asset key
}

function isHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validButtons(buttons = []) {
  return buttons
    .map((b) => ({ label: fitText(b.label, 32), url: (b.url || '').trim() }))
    .filter((b) => b.label && isHttpUrl(b.url) && b.url.length <= 512)
    .slice(0, 2);
}

/**
 * Compute {start, end} (ms epoch) for a presence.
 * ctx.sessionStart = when this status was applied, ctx.appStart = when the app started.
 */
export function computeTimestamps(p, ctx = {}) {
  const t = p.timestamps || {};
  const now = ctx.now ?? Date.now();
  switch (t.mode) {
    case 'session':
      return { start: ctx.sessionStart ?? now };
    case 'app':
      return { start: ctx.appStart ?? now };
    case 'countdown': {
      if (ctx.countdownEnd) return { end: ctx.countdownEnd };
      const minutes = Math.max(1, Number(t.minutes) || 25);
      return { end: (ctx.sessionStart ?? now) + minutes * 60_000 };
    }
    case 'clock': {
      // "elapsed since local midnight" renders as the current local time in Discord.
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return { start: d.getTime() };
    }
    case 'custom': {
      const start = Date.parse(t.start);
      return Number.isFinite(start) ? { start } : undefined;
    }
    default:
      return undefined;
  }
}

function assetsFor(p, resolve = resolveImage) {
  const assets = {};
  const large = resolve(p.largeImage);
  const small = resolve(p.smallImage);
  if (large) {
    assets.large_image = large;
    const lt = fitText(p.largeText);
    if (lt) assets.large_text = lt;
  }
  if (small) {
    assets.small_image = small;
    const st = fitText(p.smallText);
    if (st) assets.small_text = st;
  }
  return Object.keys(assets).length ? assets : undefined;
}

/** Activity payload for the local Discord client (IPC SET_ACTIVITY). */
export function toRpcActivity(input, ctx = {}) {
  const p = normalizePresence(input);
  const type = [0, 2, 3, 5].includes(p.type) ? p.type : 0;
  const activity = { type, instance: false };
  const details = fitText(p.details);
  const state = fitText(p.state);
  if (details) activity.details = details;
  if (state) activity.state = state;
  const ts = computeTimestamps(p, ctx);
  if (ts) activity.timestamps = ts;
  const assets = assetsFor(p);
  if (assets) activity.assets = assets;
  const buttons = validButtons(p.buttons);
  if (buttons.length) activity.buttons = buttons;
  if (p.party?.enabled && state) {
    const size = Math.max(1, Number(p.party.size) || 1);
    const max = Math.max(size, Number(p.party.max) || size);
    activity.party = { id: 'dss-party', size: [size, max] };
  }
  if (p.statusDisplay in STATUS_DISPLAY && p.statusDisplay !== 'name') {
    activity.status_display_type = STATUS_DISPLAY[p.statusDisplay];
  }
  return activity;
}

/**
 * Activity list for a Gateway presence update. Gateway activities can carry a free
 * `name` (RPC takes it from the Discord application instead) and a custom status.
 * `opts.bot` strips fields bots are not allowed to send.
 */
export function toGatewayActivities(input, ctx = {}, opts = {}) {
  const p = normalizePresence(input);
  const out = [];
  const cs = p.customStatus || {};
  if ((cs.text || cs.emoji) && !opts.bot) {
    const custom = { type: 4, name: 'Custom Status', state: fitText(cs.text) || undefined };
    if (cs.emoji) custom.emoji = { name: cs.emoji };
    out.push(custom);
  }
  const name = fitText(p.name) || fitText(p.details) || 'Discord Status Studio';
  if (opts.bot) {
    const type = p.type === 1 ? 0 : p.type;
    const act = { type, name };
    if (type === 4) act.state = fitText(p.state || p.details || p.name);
    else if (fitText(p.state)) act.state = fitText(p.state);
    out.push(act);
    return out;
  }
  if (!p.name && !p.details && !p.state) return out;
  const act = { type: p.type === 4 ? 0 : p.type, name };
  if (opts.applicationId) act.application_id = opts.applicationId;
  const details = fitText(p.details);
  const state = fitText(p.state);
  if (details) act.details = details;
  if (state) act.state = state;
  const ts = computeTimestamps(p, ctx);
  if (ts) act.timestamps = ts;
  const assets = assetsFor(p, opts.resolveImage || resolveImage);
  if (assets) act.assets = assets;
  const buttons = validButtons(p.buttons);
  if (buttons.length) {
    act.buttons = buttons.map((b) => b.label);
    act.metadata = { button_urls: buttons.map((b) => b.url) };
  }
  if (p.statusDisplay in STATUS_DISPLAY && p.statusDisplay !== 'name') {
    act.status_display_type = STATUS_DISPLAY[p.statusDisplay];
  }
  out.push(act);
  return out;
}

/** One-line human summary, used for tray tooltip, history and CLI. */
export function summarize(p) {
  if (!p) return '(없음)';
  const parts = [p.name, p.details, p.state].map((s) => (s || '').trim()).filter(Boolean);
  return parts.join(' · ') || '(빈 상태)';
}
