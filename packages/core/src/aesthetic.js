// Offline "aesthetic" status generator. Detects what the user is doing from free
// text (Korean or English), then renders it with Discord-friendly styling rules.
// Works without any API key; the AI generator (ai.js) builds on the same styles.
import { normalizePresence } from './presence.js';
import { FONTS } from './fonts.js';

const topic = (id, keywords, o) => ({ id, keywords, type: 0, ...o });

export const TOPICS = [
  topic('coding', ['코딩', '개발', '프로그래밍', '코드', 'code', 'coding', 'dev', 'develop', 'program', 'vscode', 'vs code', 'cursor', 'github', '깃', 'debug', '디버깅', 'typescript', 'python', 'javascript', 'rust', 'java'], {
    emojis: ['⌨️', '⚡', '💻', '🧑‍💻', '🛠️'],
    titles: ['Coding', 'Coding Mode', 'Development', 'Building', 'Shipping Code'],
    details: ['Building something cool', 'Building something new', 'Working on something', 'Shipping features', 'Turning coffee into code', 'Writing clean code'],
    states: ['Currently coding', 'In the zone', 'Fixing bugs', 'git push --force', 'One more commit', 'Compiling…'],
    button: '🌐 Website',
  }),
  topic('webdev', ['웹', 'web', 'website', '홈페이지', 'frontend', '프론트', 'backend', '백엔드', 'react', 'next', 'html', 'css', 'svelte', 'vue'], {
    emojis: ['🌐', '🕸️', '⚡', '🎨'],
    titles: ['Web Development', 'Frontend', 'Web Dev', 'Building the Web'],
    details: ['Crafting websites', 'Pushing pixels & APIs', 'Shipping to production', 'Designing the web'],
    states: ['HTML · CSS · JS', 'Deploying…', 'localhost:3000', 'Centering a div'],
    button: '🌐 Website',
  }),
  topic('minecraft', ['마크', '마인크래프트', 'minecraft', 'mc서버', 'mc ', '마크서버', 'spigot', 'paper', 'forge', 'fabric'], {
    emojis: ['⛏️', '🌲', '🧱', '💎', '🟩'],
    titles: ['Minecraft', 'Mining another world', 'Somewhere in Minecraft', 'Blocky Adventures'],
    details: ['Exploring the unknown', 'Building & exploring', 'Surviving another night', 'Digging straight down', 'Punching trees'],
    states: ['Building my world', 'Looking for diamonds', 'Avoiding creepers', 'Survival mode'],
    dev: { titles: ['Minecraft Development', 'Server Development', 'Plugin Dev'], details: ['Building my server', 'Writing plugins', 'Crafting the server'] },
    button: '⛏️ Join Server',
  }),
  topic('gaming', ['게임', '겜', 'game', 'gaming', 'gamer', 'steam', '스팀', 'play', '플레이', 'rank', '랭크'], {
    emojis: ['🎮', '🕹️', '👾', '🔥', '🏆'],
    titles: ['Gaming', 'Game Time', 'In Game', 'Player One'],
    details: ['In the zone', 'Carrying the team', 'Grinding ranked', 'Just one more game', 'GG only'],
    states: ['Gamer at heart', 'Do not disturb', 'Queueing up', 'Touching grass later'],
  }),
  topic('valorant', ['발로', '발로란트', 'valorant', 'valo'], {
    emojis: ['🎯', '🔫', '💥'], titles: ['VALORANT', 'Ranked Grind', 'Tactical Mode'],
    details: ['Clutching rounds', 'Headshots only', 'Climbing ranked', 'Planting the spike'], states: ['In competitive', '1v5 clutch loading', 'Ace incoming'],
  }),
  topic('lol', ['롤', '리그오브레전드', 'league', 'lol', '협곡'], {
    emojis: ['⚔️', '🏹', '🛡️'], titles: ['League of Legends', 'Summoner\'s Rift', 'Ranked Solo'],
    details: ['Farming minions', 'Carrying bot lane', 'Climbing the ladder', 'Diff jungle'], states: ['In game', 'Defending nexus', 'FF at 15?'],
  }),
  topic('overwatch', ['옵치', '오버워치', 'overwatch'], {
    emojis: ['🛡️', '🎯'], titles: ['Overwatch', 'Payload Duty'], details: ['Pushing the payload', 'Healing the team'], states: ['Competitive', 'Group up!'],
  }),
  topic('roblox', ['로블록스', 'roblox'], {
    emojis: ['🟥', '🎲'], titles: ['Roblox', 'Blox World'], details: ['Obby speedrun', 'Hanging out'], states: ['Playing with friends', 'Collecting badges'],
  }),
  topic('music', ['음악', '노래', 'music', 'song', 'spotify', '스포티파이', 'listening', '듣', 'playlist', '플리', 'melon', '멜론'], {
    type: 2,
    emojis: ['🎵', '🎧', '🎶', '💿'],
    titles: ['Music', 'Now Playing', 'Vibing', 'On Repeat'],
    details: ['Vibing to music', 'Lost in the sound', 'Headphones on', 'Playlist on shuffle'],
    states: ['Do not disturb', 'Volume up', 'Good vibes only', 'Currently vibing'],
  }),
  topic('musicprod', ['작곡', '비트', '믹싱', 'fl studio', 'ableton', 'producing', 'beat', 'daw'], {
    emojis: ['🎹', '🎛️', '🎚️'], titles: ['Music Production', 'In the Studio', 'Making Beats'],
    details: ['Cooking up a beat', 'Mixing & mastering', 'Layering synths'], states: ['140 BPM', 'Bouncing stems', 'Studio session'],
  }),
  topic('study', ['공부', '시험', '과제', '숙제', 'study', 'studying', 'homework', 'exam', '학교', '수업', 'school', '독서실'], {
    emojis: ['📚', '✏️', '📝', '🍅'],
    titles: ['Studying', 'Study Session', 'Focus Mode', 'Library Mode'],
    details: ['Focus mode on', 'Learning something new', 'Deep work session', 'Taking notes'],
    states: ['Do not disturb', 'Pomodoro running', 'Exam season', 'Brain loading…'],
  }),
  topic('reading', ['책', '독서', 'reading', 'book', '소설', 'novel'], {
    emojis: ['📖', '📚', '🔖'], titles: ['Reading', 'Bookworm Mode'], details: ['Lost in a book', 'Turning pages'], states: ['One more chapter', 'Quiet time'],
  }),
  topic('sleep', ['잠', '자는', '수면', 'sleep', 'sleeping', 'zzz', '꿀잠'], {
    emojis: ['😴', '🌙', '💤'], titles: ['Sleeping', 'Dreamland', 'Offline'], details: ['Recharging batteries', 'Dreaming in HD'], states: ['Back tomorrow', 'Do not wake'],
  }),
  topic('afk', ['afk', '자리비움', '잠수', 'away', 'brb', '외출'], {
    emojis: ['💤', '🚶', '🌿'], titles: ['AFK', 'Away', 'Touching Grass'], details: ['Away from keyboard', 'Stepped out for a bit'], states: ['Back soon', 'Leave a message'],
  }),
  topic('latenight', ['새벽', '밤샘', 'late night', 'night', '야간', '밤'], {
    emojis: ['🌙', '🌃', '☕', '🦉'], titles: ['Late Night', 'Night Owl', '3 AM Mode'], details: ['Late night coding', 'Still awake', 'Night shift'], states: ['One more commit…', 'Coffee #4', 'Sleep is optional'],
  }),
  topic('work', ['일', '업무', '회사', '출근', 'work', 'working', 'office', 'meeting', '회의'], {
    emojis: ['💼', '📊', '🗂️'], titles: ['Working', 'At Work', 'Office Hours'], details: ['Busy with work', 'In a meeting', 'Crushing tasks'], states: ['Reply later', 'Deep work', 'Clocked in'],
  }),
  topic('design', ['디자인', 'design', 'figma', '피그마', 'ui', 'ux', 'photoshop', '포토샵', 'illustrator'], {
    emojis: ['🎨', '✏️', '🖌️'], titles: ['Designing', 'Design Mode', 'In Figma'], details: ['Pushing pixels', 'Crafting interfaces', 'Kerning letters'], states: ['Making it pop', 'Pixel perfect', 'Ctrl+Z × 99'],
  }),
  topic('video', ['영상', '편집', 'video', 'editing', 'premiere', '프리미어', 'after effects', '애프터이펙트', 'davinci', '유튜브'], {
    emojis: ['🎬', '✂️', '🎞️'], titles: ['Editing', 'Video Editing', 'In the Timeline'], details: ['Editing a video', 'Cutting frames', 'Color grading'], states: ['Rendering…', 'Export at 99%', 'Keyframes everywhere'],
  }),
  topic('stream', ['방송', '스트리밍', 'stream', 'streaming', 'twitch', '트위치', 'live', '라이브', 'chzzk', '치지직', 'soop', '숲'], {
    emojis: ['📺', '🔴', '🎙️'], titles: ['LIVE', 'Streaming', 'On Air'], details: ['Live right now', 'Come hang out'], states: ['Chat is open', 'Say hi!'],
    button: '📺 Watch Live',
  }),
  topic('ai', ['ai', '인공지능', 'claude', 'gpt', 'llm', '머신러닝', 'ml', 'prompt', '프롬프트', 'model'], {
    emojis: ['🤖', '🧠', '✨'], titles: ['AI Lab', 'Prompting', 'Machine Learning'], details: ['Training models', 'Talking to AI', 'Prompt engineering'], states: ['Tokens go brrr', 'Thinking…', 'Hallucination-free'],
  }),
  topic('anime', ['애니', '애니메이션', 'anime', '만화', 'manga', '웹툰'], {
    type: 3, emojis: ['🌸', '✨', '🍥'], titles: ['Anime', 'Watching Anime'], details: ['One more episode', 'Binge mode'], states: ['Weeb hours', 'Subbed, not dubbed'],
  }),
  topic('movie', ['영화', '드라마', 'movie', 'netflix', '넷플릭스', 'watching', '시청', 'youtube'], {
    type: 3, emojis: ['🍿', '🎬', '📺'], titles: ['Movie Night', 'Watching'], details: ['Popcorn ready', 'Binge watching'], states: ['No spoilers', 'Lights off'],
  }),
  topic('gym', ['운동', '헬스', 'gym', 'workout', '러닝', 'running', 'fitness'], {
    emojis: ['💪', '🏋️', '🏃'], titles: ['Workout', 'Gym Time'], details: ['Lifting heavy', 'Leg day'], states: ['No pain, no gain', 'Hydrate!'],
  }),
  topic('food', ['밥', '요리', '식사', 'eat', 'cooking', 'food', 'dinner', 'lunch', '점심', '저녁'], {
    emojis: ['🍜', '🍳', '🍕'], titles: ['Eating', 'Chef Mode'], details: ['Grabbing food', 'Cooking something good'], states: ['brb, food', 'Mukbang time'],
  }),
  topic('chill', ['휴식', '쉬는', 'chill', 'relax', '멍', '힐링', 'lofi', '로파이', '카페', 'cafe'], {
    emojis: ['☕', '🌿', '🌧️', '🫧'], titles: ['Chilling', 'Lo-fi Mode', 'Cozy Hours'], details: ['lo-fi beats to relax to', 'Taking it easy'], states: ['rain on the window', 'Good vibes'],
  }),
  topic('travel', ['여행', 'travel', 'trip', '비행', 'flight'], {
    emojis: ['✈️', '🗺️', '🏝️'], titles: ['Traveling', 'On a Trip'], details: ['Exploring the world', 'Somewhere new'], states: ['Out of office', 'Wanderlust'],
  }),
  topic('drawing', ['그림', 'drawing', 'art', '일러스트', 'illust', '드로잉', 'procreate', 'clip studio'], {
    emojis: ['🖌️', '🎨', '✍️'], titles: ['Drawing', 'Art Mode'], details: ['Sketching ideas', 'Painting something'], states: ['Brush in hand', 'Line art stage'],
  }),
];

export const STYLES = [
  { id: 'classic', label: '클래식', render: (v) => ({ details: `${v.emoji} ${v.title}`, state: v.detail }) },
  { id: 'twoline', label: '두 줄', render: (v) => ({ details: `${v.emoji}  ${v.title}`, state: v.detail }) },
  { id: 'caps', label: '대문자', render: (v) => ({ details: v.title.toUpperCase(), state: v.state }) },
  { id: 'tree', label: '트리', render: (v) => ({ details: `┌─ ${v.title.toUpperCase()}`, state: `└─ ${v.state.toLowerCase()}...` }) },
  { id: 'bold', label: '볼드', render: (v) => ({ details: `${v.emoji} ${FONTS.bold(v.title)}`, state: v.detail }) },
  { id: 'sparkle', label: '반짝', render: (v) => ({ details: `✦ ${v.title.toLowerCase()} ✦`, state: v.detail.toLowerCase() }) },
  { id: 'brackets', label: '괄호', render: (v) => ({ details: `【 ${v.title} 】`, state: `『 ${v.detail} 』` }) },
  { id: 'terminal', label: '터미널', render: (v) => ({ details: `> ${v.title.toLowerCase().replace(/\s+/g, '_')}_`, state: `$ ${v.state.toLowerCase()}` }) },
  { id: 'smallcaps', label: '스몰캡', render: (v) => ({ details: `${v.emoji} ${FONTS.smallCaps(v.title)}`, state: FONTS.smallCaps(v.detail) }) },
  { id: 'dots', label: '점', render: (v) => ({ details: `${v.emoji} ${v.title} · ${v.state}`, state: v.detail }) },
  { id: 'mono', label: '모노', render: (v) => ({ details: FONTS.mono(v.title.toLowerCase()), state: `— ${v.detail.toLowerCase()}` }) },
  { id: 'spaced', label: '자간', render: (v) => ({ details: FONTS.spaced(v.title.toUpperCase()), state: `${v.emoji} ${v.state}` }) },
  { id: 'arrow', label: '화살표', render: (v) => ({ details: `${v.emoji} ${v.title}`, state: `➜ ${v.state}` }) },
  { id: 'wave', label: '물결', render: (v) => ({ details: `～ ${v.title} ～`, state: `${v.detail} ♪` }) },
  { id: 'script', label: '필기체', render: (v) => ({ details: `${v.emoji} ${FONTS.script(v.title)}`, state: v.detail }) },
  { id: 'double', label: '더블', render: (v) => ({ details: FONTS.double(v.title), state: `${v.emoji} ${v.state}` }) },
];

// Deterministic RNG so the same seed always gives the same variant.
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

const LINK_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?)/i;

export function extractLink(text = '') {
  const m = text.match(LINK_RE);
  if (!m) return null;
  const raw = m[1];
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return { raw: raw.replace(/^https?:\/\//i, ''), url };
}

// ASCII keywords must start at a word boundary ("ui" must not match "building");
// short ones (<= 3 chars) must be a whole word. Korean keywords match anywhere.
const kwCache = new Map();
function keywordHit(lower, k) {
  if (!/^[\x20-\x7e]+$/.test(k)) return lower.includes(k);
  let re = kwCache.get(k);
  if (!re) {
    const esc = k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(^|[^a-z0-9])${esc}${k.trim().length <= 3 ? '($|[^a-z0-9])' : ''}`);
    kwCache.set(k, re);
  }
  return re.test(lower);
}

export function detectTopics(text = '') {
  const lower = ` ${text.toLowerCase()} `;
  const scored = TOPICS.map((tp) => {
    let score = 0;
    for (const k of tp.keywords) if (keywordHit(lower, k)) score += k.length >= 4 ? 2 : 1;
    return { tp, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  // Specific games beat the generic "gaming" topic.
  const specific = scored.find((x) => !['gaming', 'coding'].includes(x.tp.id) && x.score >= 1);
  const ordered = specific ? [specific, ...scored.filter((x) => x !== specific)] : scored;
  return ordered.map((x) => x.tp);
}

const DEV_WORDS = ['개발', '만드', '제작', 'dev', 'develop', 'plugin', '플러그인', '서버 개발', 'coding', '코딩'];

function cleanTitle(text) {
  let s = text
    .replace(LINK_RE, '')
    .replace(/(하는\s*)?중(이에요|입니다|임)?$/g, '')
    .replace(/(느낌으로|스타일로)?\s*(만들어\s*줘|해\s*줘|부탁해)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'Something';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildVars(text, r, opts = {}) {
  const topics = detectTopics(text);
  const main = topics[0];
  const second = topics.find((x) => x !== main && x.id !== main?.id);
  const lower = text.toLowerCase();
  if (!main) {
    const title = cleanTitle(text);
    return {
      topic: null,
      emoji: pick(r, ['✨', '⚡', '🌙', '🔥', '💫', '🎯']),
      title,
      detail: pick(r, ['Working on something', 'In the zone', 'Doing my thing', 'Busy being awesome']),
      state: pick(r, ['Currently busy', 'Back soon', 'Good vibes only', 'One step at a time']),
      type: 0,
    };
  }
  const isDev = main.dev && DEV_WORDS.some((w) => lower.includes(w));
  const titles = isDev ? main.dev.titles : main.titles;
  const details = isDev ? main.dev.details : main.details;
  const v = {
    topic: main,
    second,
    emoji: pick(r, main.emojis),
    title: pick(r, titles),
    detail: pick(r, details),
    state: pick(r, main.states),
    type: main.type ?? 0,
  };
  if (second && !opts.single) {
    v.state = `${second.emojis[0]} ${pick(r, second.states)}`;
  }
  return v;
}

/**
 * Generate presence variants from free text.
 *   generate('Minecraft 서버 개발 중 mc.krl.kr', { count: 4 })
 */
export function generate(text, { count = 4, seed, styleIds } = {}) {
  const baseSeed = seed ?? hash(text) ^ Date.now();
  const link = extractLink(text);
  const styles = styleIds?.length ? STYLES.filter((s) => styleIds.includes(s.id)) : STYLES;
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = rng(baseSeed + i * 7919);
    const v = buildVars(text, r);
    const style = i === 0 ? STYLES[0] : pick(r, styles);
    out.push(toPresence(v, style, link, r));
  }
  return out;
}

function toPresence(v, style, link, r) {
  const lines = style.render(v);
  const p = {
    name: v.topic ? stripEmoji(`${v.title}`) : v.title,
    type: v.type,
    details: lines.details,
    // Mixed requests ("게임 좋아하는 개발자") show the second topic on the state line.
    state: link ? link.raw : v.second ? v.state : lines.state,
    largeImage: v.emoji,
    largeText: v.title,
    smallImage: v.second ? v.second.emojis[0] : '🟢',
    smallText: v.second ? pick(r, v.second.titles) : 'Online',
    buttons: [],
    timestamps: { mode: 'session' },
    customStatus: { emoji: v.emoji, text: v.detail.toLowerCase() },
    _style: style.id,
    _topic: v.topic?.id || null,
  };
  if (link) {
    p.buttons.push({ label: v.topic?.button || '🌐 Website', url: link.url });
  }
  return normalizePresence(p);
}

function stripEmoji(s) {
  return s.replace(/[\p{Extended_Pictographic}️‍]/gu, '').trim();
}

/**
 * "Make it aesthetic": keep the meaning of the current presence but restyle it.
 * `step` increments each click so users cycle through different looks.
 */
export function restyle(presence, step = 0) {
  const p = normalizePresence(presence);
  const text = [p.name, p.details, p.state].filter(Boolean).join(' ');
  const r = rng(hash(text) + step * 104729);
  const topics = detectTopics(text);
  const v = topics.length
    ? buildVars(text, r, { single: true })
    : {
        topic: null,
        emoji: pick(r, ['✨', '⚡', '🌙', '🔥', '💫']),
        title: stripEmoji(p.details || p.name || 'Something') || 'Something',
        detail: stripEmoji(p.state || 'In the zone') || 'In the zone',
        state: stripEmoji(p.state || 'Currently busy') || 'Currently busy',
        type: p.type,
      };
  const style = STYLES[(step + 1) % STYLES.length];
  const lines = style.render(v);
  return normalizePresence({
    ...p,
    details: lines.details,
    state: lines.state,
    largeImage: p.largeImage || v.emoji,
    largeText: p.largeText || v.title,
    _style: style.id,
  });
}

/** Render the same content in a specific style (the "다른 스타일" button). */
export function applyStyle(presence, styleId) {
  const p = normalizePresence(presence);
  const style = STYLES.find((s) => s.id === styleId) || STYLES[0];
  const clean = (s) => stripEmoji(s || '').replace(/^[┌└─>$【『～✦\s]+|[】』～✦_.\s]+$/g, '').trim();
  const v = {
    emoji: (p.details.match(/\p{Extended_Pictographic}/u) || [p.largeImage || '✨'])[0],
    title: clean(p.details) || clean(p.name) || 'Something',
    detail: clean(p.state) || 'In the zone',
    state: clean(p.state) || 'Currently busy',
  };
  const lines = style.render(v);
  return normalizePresence({ ...p, ...lines });
}
