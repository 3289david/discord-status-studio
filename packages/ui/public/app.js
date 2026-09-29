import { createApi, AuthError } from './api.js';

const api = createApi();

// ───────── state ─────────
const S = {
  snap: null,
  meta: null,
  page: 'editor',
  draft: null,
  draftId: null,
  draftAt: Date.now(),
  variants: [],
  variantNote: '',
  aiBusy: false,
  aiPrompt: '',
  aesSeen: [],
  liveEdit: false,
  procs: null,
  rules: null,
  rulesDirty: false,
  rotation: null,
  settings: null,
  tokens: null,
  newToken: null,
  models: null,
  query: '',
  open: {}, // remembered <details> state
};

const NAV = [
  ['editor', '에디터'],
  ['library', '라이브러리'],
  ['auto', '자동화'],
  ['settings', '설정'],
];

const KIND = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };

const EMOJIS = '⚡ ⌨️ 💻 🛠️ 🌐 🚀 🔥 ✨ 🌙 🌃 ☕ 🎮 🕹️ 👾 🏆 🎯 ⚔️ ⛏️ 🌲 💎 🎵 🎧 🎹 📚 ✏️ 🍅 📖 😴 💤 🌿 💼 🎨 🎬 📺 🔴 🎙️ 🤖 🧠 🌸 🍿 💪 🍜 ✈️ 🧊 🖤 🍎 💜 💙 🟢 🟡 🔵 ⭐ 🌈 ☁️ 🌧️ ❄️ 🪐 👀 😎 🦊 🐱 🦉 👑 🎲 🔮 🧪 ⚙️ 🏠 🎉'.split(' ');

const TIMERS = [
  { l: 'Focus', m: 25, p: { details: '🍅 Focus session', state: 'Do not disturb', largeImage: '🍅', userStatus: 'dnd', customStatus: { emoji: '🍅', text: 'focus mode' } } },
  { l: '공부', m: 50, p: { details: '📚 Deep study', state: 'Back after this session', largeImage: '📚', userStatus: 'dnd', customStatus: { emoji: '📚', text: 'studying' } } },
  { l: '휴식', m: 5, p: { details: '☕ Quick break', state: 'Back in a few', largeImage: '☕', userStatus: 'idle', customStatus: { emoji: '☕', text: 'on a break' } } },
  { l: 'BRB', m: 15, p: { details: '🚶 Be right back', state: 'Stepped out', largeImage: '🚶', userStatus: 'idle', customStatus: { emoji: '🚶', text: 'brb' } } },
  { l: '식사', m: 30, p: { details: '🍜 Eating', state: 'Food first', largeImage: '🍜', userStatus: 'idle', customStatus: { emoji: '🍜', text: 'eating' } } },
  { l: '회의', m: 60, p: { details: '📹 In a meeting', state: 'Reply after', largeImage: '📹', userStatus: 'dnd', customStatus: { emoji: '📹', text: 'in a meeting' } } },
  { l: '낮잠', m: 20, p: { details: '😴 Power nap', state: 'Recharging', largeImage: '😴', userStatus: 'idle', customStatus: { emoji: '😴', text: 'napping' } } },
];

// ───────── dom helpers ─────────
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

function toast(msg, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 2200);
}

async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (r && r.connection && r.mode) setSnap(r);
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (e instanceof AuthError) return showLogin();
    toast(e.message || String(e), 'err');
    throw e;
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('복사했습니다');
}

function modal(title, body, actions = []) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => e.target === bg && bg.remove() });
  const close = () => bg.remove();
  bg.append(h('div', { class: 'modal' }, h('h2', null, title), body,
    h('div', { class: 'row', style: { marginTop: '18px', justifyContent: 'flex-end' } },
      h('button', { class: 'link', onclick: close }, '취소'),
      actions.map((a) => h('button', { class: `btn ${a.primary ? 'primary' : ''}`, onclick: async () => { if ((await a.onClick?.()) !== false) close(); } }, a.label)))));
  document.body.append(bg);
  bg.querySelector('input')?.focus();
  return close;
}

function popup(anchor, content) {
  document.querySelector('.menu')?.remove();
  const r = anchor.getBoundingClientRect();
  const m = h('div', { class: 'menu' }, content);
  document.body.append(m);
  const w = m.offsetWidth;
  m.style.top = `${Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8))}px`;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  setTimeout(() => document.addEventListener('click', function off(ev) {
    if (!m.contains(ev.target) || ev.target.closest('button')) {
      m.remove();
      document.removeEventListener('click', off);
    }
  }), 0);
  return m;
}

function menu(anchor, items) {
  popup(anchor, items.map((it) => (it === '-' ? h('div', { class: 'sep' }) : h('button', { onclick: it.onClick }, it.label))));
}

function more(key, title, body) {
  const d = h('details', { class: 'more', open: S.open[key] || null, ontoggle: () => (S.open[key] = d.open) }, h('summary', null, title), h('div', { class: 'body' }, body));
  return d;
}

// ───────── presence helpers ─────────
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️\u{1F3FB}-\u{1F3FF}⃣#*0-9])+$/u;
const isEmoji = (s) => typeof s === 'string' && s.trim() && EMOJI_ONLY.test(s.trim()) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
const twemoji = (e) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${Array.from(e.trim()).map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== 'fe0f').join('-')}.png`;

function img(v) {
  v = (v || '').trim();
  if (!v) return null;
  if (isEmoji(v)) return h('img', { src: twemoji(v), class: 'emoji', alt: '' });
  if (/^https?:\/\//.test(v)) return h('img', { src: v, alt: '', referrerpolicy: 'no-referrer' });
  return h('span', null, v.slice(0, 6));
}

function blank() {
  return { name: '', type: 0, details: '', state: '', largeImage: '', largeText: '', smallImage: '', smallText: '', buttons: [], timestamps: { mode: 'session', minutes: 25, start: '' }, party: { enabled: false, size: 1, max: 4 }, statusDisplay: 'name', appProfile: '', userStatus: 'online', customStatus: { emoji: '', text: '' } };
}
function fill(p) {
  const b = blank();
  return { ...b, ...clone(p || {}), timestamps: { ...b.timestamps, ...(p?.timestamps || {}) }, party: { ...b.party, ...(p?.party || {}) }, customStatus: { ...b.customStatus, ...(p?.customStatus || {}) }, buttons: clone(p?.buttons || []) };
}
const len = (s) => Array.from(s || '').length;
const strip = (s) => (s || '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').trim();

function clock(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}
const dur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분` : `${Math.floor(sec / 60)}분`);
const hm = (ts) => new Date(ts).toTimeString().slice(0, 5);

function times(p, since) {
  const t = p?.timestamps || {};
  if (t.mode === 'session' || t.mode === 'app') return { start: since };
  if (t.mode === 'countdown') return { end: since + (Number(t.minutes) || 25) * 60000 };
  if (t.mode === 'clock') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { start: d.getTime() };
  }
  if (t.mode === 'custom' && Date.parse(t.start)) return { start: Date.parse(t.start) };
  return null;
}

function vars(s) {
  if (!s || !s.includes('{')) return s;
  const d = new Date();
  const v = {
    time: d.toTimeString().slice(0, 5),
    date: d.toISOString().slice(0, 10),
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    hour: String(d.getHours()),
    greeting: d.getHours() < 5 ? 'Late night' : d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening',
    ...(S.snap?.windowInfo || {}),
  };
  return s.replace(/\{random:([^}]*)\}/g, (_, l) => l.split('|')[0]).replace(/\{([a-z_]+)(?:\|([^}]*))?\}/gi, (m, k, fb) => v[k.toLowerCase()] || fb || `‹${k}›`);
}

function appName(p) {
  const prof = S.snap?.settings?.appProfiles?.find((a) => a.id === p.appProfile);
  return vars(prof?.name || p.name || 'Discord Status Studio');
}

// ───────── preview ─────────
function preview(p, since) {
  const u = S.snap?.connection?.user;
  const name = u?.global_name || u?.username || 'You';
  const av = u?.avatar ? h('img', { src: `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`, alt: '' }) : null;
  const custom = p && S.snap.settings.transport === 'gateway-user' && (p.customStatus?.text || p.customStatus?.emoji);
  const box = h('div', { class: 'pv' },
    h('div', { class: 'pv-user' },
      h('div', { class: 'pv-av' }, av, h('div', { class: `pv-st ${p?.userStatus || 'online'}` })),
      h('div', { class: 'ellipsis' }, h('div', null, name), custom ? h('div', { class: 'small muted ellipsis' }, `${p.customStatus.emoji || ''} ${vars(p.customStatus.text || '')}`) : null)));
  if (!p) {
    box.append(h('div', { class: 'pv-empty' }, '표시 중인 활동 없음'));
    return box;
  }
  const t = times(p, since);
  const large = img(p.largeImage);
  const small = img(p.smallImage);
  const party = p.party?.enabled && p.state ? ` (${p.party.size} of ${p.party.max})` : '';
  box.append(...[
    h('div', { class: 'pv-kind' }, KIND[p.type] || 'Playing'),
    h('div', { class: 'pv-act' },
      large || small ? h('div', { class: 'pv-imgs' }, h('div', { class: 'pv-large', title: p.largeText || '' }, large), small ? h('div', { class: 'pv-small', title: p.smallText || '' }, small) : null) : null,
      h('div', { class: 'pv-lines' },
        h('div', { class: 'n' }, appName(p)),
        p.details ? h('div', null, vars(p.details)) : null,
        p.state ? h('div', null, vars(p.state) + party) : null,
        t ? h('div', { class: 't tick', 'data-start': t.start || '', 'data-end': t.end || '' }) : null)),
    p.buttons?.some((b) => b.label) ? h('div', { class: 'pv-btns' }, p.buttons.filter((b) => b.label).slice(0, 2).map((b) => h('div', { title: b.url }, vars(b.label)))) : null,
  ].filter(Boolean));
  tick(box);
  return box;
}

function tick(root = document) {
  const now = Date.now();
  root.querySelectorAll('.tick').forEach((el) => {
    const s = Number(el.dataset.start);
    const e = Number(el.dataset.end);
    el.textContent = e ? `${clock(e - now)} left` : s ? `${clock(now - s)} elapsed` : '';
  });
  root.querySelectorAll('[data-until]').forEach((el) => (el.textContent = clock(Number(el.dataset.until) - now)));
}
setInterval(() => tick(), 1000);

// ───────── shell ─────────
const app = document.getElementById('app');
let headEl, pageEl;

function applyTheme() {
  const t = S.snap?.settings?.uiTheme || 'dark';
  document.documentElement.dataset.theme = t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
}

function buildShell() {
  headEl = h('div', { class: 'header-in' });
  pageEl = h('main', { class: 'page' });
  app.replaceChildren(h('header', { class: 'header' }, headEl), pageEl);
}

function go(page) {
  S.page = page;
  if (page === 'auto') {
    S.rules = null;
    S.rotation = null;
  }
  if (page === 'settings') S.settings = null;
  render();
  scrollTo(0, 0);
}

function connection() {
  const c = S.snap.connection || {};
  if (S.snap.paused) return ['', '일시정지됨'];
  if (c.status === 'connected') return ['ok', null];
  if (c.status === 'connecting') return ['warn', '연결 중'];
  if (c.status === 'disabled') return ['', 'Discord 전송 꺼짐'];
  return ['bad', c.error || '연결 안 됨'];
}

function renderHeader() {
  const [cls, err] = connection();
  const live = S.snap.live;
  const o = S.snap.override;
  const text = err || [live?.presence?.details, live?.presence?.state].filter(Boolean).join(' · ') || '—';
  headEl.replaceChildren(
    h('div', { class: 'brand' }, 'Status Studio'),
    h('nav', { class: 'nav' }, NAV.map(([id, label]) => h('button', { class: S.page === id ? 'on' : '', onclick: () => go(id) }, label))),
    h('div', { class: 'live' },
      h('span', { class: `dot ${cls}`, title: S.snap.connection.error || S.snap.connection.status }),
      h('span', { class: 'ellipsis', title: live?.label || '' }, text),
      o && o.until > Date.now() ? h('button', { class: 'link small', title: '타이머 종료', onclick: () => run(() => api.call('cancelTimer')) }, h('span', { 'data-until': o.until }, clock(o.until - Date.now())), ' ×') : null,
      h('button', { class: 'link small', onclick: () => run(() => api.call('setPaused', !S.snap.paused)) }, S.snap.paused ? '재개' : '일시정지')));
}

function setSnap(snap) {
  const first = !S.snap;
  S.snap = snap;
  applyTheme();
  if (first) return;
  renderHeader();
  if (S.page === 'library') render();
  else if (S.page === 'editor') refreshSide();
  else if (S.page === 'auto') refreshAuto();
}

function render() {
  renderHeader();
  const pages = { editor: pageEditor, library: pageLibrary, auto: pageAuto, settings: pageSettings };
  const y = scrollY;
  pageEl.replaceChildren(pages[S.page]());
  scrollTo(0, y);
}

// ───────── editor ─────────
let liveTimer;
function changed() {
  refreshPreview();
  if (S.liveEdit) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => run(() => api.call('updateCurrent', S.draft)), 400);
  }
}

const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setP(o, path, val) {
  const ks = path.split('.');
  let c = o;
  ks.slice(0, -1).forEach((k, i) => {
    if (c[k] == null) c[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    c = c[k];
  });
  c[ks.at(-1)] = val;
}

function text(label, path, { max = 128, placeholder = '', type = 'text' } = {}) {
  const count = h('span', { class: 'count' });
  const upd = (v) => (count.textContent = len(v) > max ? `${len(v)}/${max}` : '');
  const input = h('input', {
    class: 'input', type, value: getP(S.draft, path) ?? '', placeholder,
    oninput: (e) => {
      setP(S.draft, path, type === 'number' ? Number(e.target.value) : e.target.value);
      upd(e.target.value);
      changed();
    },
  });
  upd(input.value);
  return h('div', { class: 'field' }, h('label', null, label, count), input);
}

function select(label, path, options, onChange) {
  const cur = String(getP(S.draft, path) ?? '');
  return h('div', { class: 'field' }, h('label', null, label),
    h('select', {
      class: 'input',
      onchange: (e) => {
        setP(S.draft, path, path === 'type' ? Number(e.target.value) : e.target.value);
        onChange ? onChange() : changed();
      },
    }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === cur || null }, l))));
}

function imageField(label, path, tipPath) {
  const thumb = h('div', { class: 'thumb' }, img(getP(S.draft, path)));
  const input = h('input', {
    class: 'input', value: getP(S.draft, path) || '', placeholder: '이모지, 이미지 URL 또는 에셋 키',
    oninput: (e) => {
      setP(S.draft, path, e.target.value.trim());
      thumb.replaceChildren(img(e.target.value) || '');
      changed();
    },
  });
  const set = (v) => {
    input.value = v;
    input.dispatchEvent(new Event('input'));
  };
  const tools = h('div', { class: 'row small' },
    h('button', { class: 'link', onclick: (e) => { e.stopPropagation(); popup(e.currentTarget, h('div', { class: 'emoji-grid' }, EMOJIS.map((em) => h('button', { onclick: () => set(em) }, em)))); } }, '이모지'),
    api.kind === 'web'
      ? h('label', { class: 'link', style: { cursor: 'pointer' } }, '업로드', h('input', {
          type: 'file', class: 'hidden', accept: 'image/png,image/jpeg,image/gif,image/webp',
          onchange: async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const r = await run(() => api.upload(f), '업로드했습니다');
            if (r?.url) set(r.url);
          },
        }))
      : null);
  return h('div', { class: 'stack', style: { gap: '6px' } },
    h('div', { class: 'field' }, h('label', null, label), h('div', { class: 'img-row' }, thumb, input)),
    h('div', { class: 'grid2' }, tools, h('input', { class: 'input', value: getP(S.draft, tipPath) || '', placeholder: '툴팁', oninput: (e) => { setP(S.draft, tipPath, e.target.value); changed(); } })));
}

function ensureDraft() {
  if (!S.draft) load(S.snap.current, S.snap.currentStatusId);
}
function load(p, id = null) {
  S.draft = fill(p);
  S.draftId = id;
  S.draftAt = Date.now();
}

let previewEl, sideInfo;
function refreshPreview() {
  if (previewEl) previewEl.replaceChildren(preview(S.draft, S.draftAt));
}
function refreshSide() {
  if (!sideInfo) return;
  const l = S.snap.live;
  const [cls, err] = connection();
  sideInfo.replaceChildren(
    h('div', { class: 'row small muted', style: { flexWrap: 'nowrap' } }, h('span', { class: `dot ${cls}` }), h('span', { class: 'ellipsis' }, err || `표시 중 · ${(l?.label || '').replace(/^\S+\s/, '')}`)),
    S.snap.mode !== 'manual' && !S.snap.paused ? h('div', { class: 'hint' }, `${S.snap.mode === 'auto' ? '자동' : '순환'} 모드 — 적용하면 수동으로 바뀝니다`) : '');
}

async function generateAi() {
  const prompt = S.aiPrompt.trim();
  if (!prompt || S.aiBusy) return;
  S.aiBusy = true;
  render();
  try {
    const r = await run(() => api.call('aiDesign', prompt, 4));
    S.variants = r.variants;
    S.variantNote = r.source === 'ai' ? r.model || 'AI' : r.error ? `오프라인 · ${r.error}` : '오프라인';
  } finally {
    S.aiBusy = false;
    render();
  }
}

function pageEditor() {
  ensureDraft();
  const d = S.draft;
  const s = S.snap.settings;
  const profiles = s.appProfiles || [];
  const needsId = s.transport === 'rpc' && !s.clientId;

  const ai = h('input', {
    class: 'input', value: S.aiPrompt, placeholder: '원하는 느낌을 적고 Enter — 예: 새벽 코딩, Minecraft 서버 개발 중 mc.krl.kr',
    oninput: (e) => (S.aiPrompt = e.target.value),
    onkeydown: (e) => e.key === 'Enter' && !e.isComposing && generateAi(),
  });

  const left = h('div', { class: 'stack', style: { gap: '20px' } },
    needsId ? h('div', { class: 'note warn' }, 'Discord Application ID가 필요합니다. ', h('button', { class: 'link', style: { textDecoration: 'underline' }, onclick: () => go('settings') }, '설정')) : null,
    h('div', null,
      h('div', { class: 'ai' }, ai, h('button', { class: 'btn', disabled: S.aiBusy || null, onclick: generateAi }, S.aiBusy ? '…' : '생성')),
      S.variants.length
        ? h('div', { class: 'variants' },
            S.variants.map((v) => h('button', { class: 'variant', onclick: () => { load({ ...v, appProfile: d.appProfile }); S.variants = []; render(); } },
              img(v.largeImage) || h('span'),
              h('div', { class: 'ellipsis' }, h('span', null, v.details), h('span', { class: 'muted' }, `   ${v.state}`)))),
            h('div', { class: 'hint', style: { padding: '4px 6px' } }, S.variantNote))
        : null),

    h('div', { class: 'stack' },
      text('Details', 'details', { placeholder: '⚡ Building something cool' }),
      text('State', 'state', { placeholder: '⌨️ Currently coding' }),
      profiles.length
        ? select('Name', 'appProfile', [['', s.clientId ? '기본 앱' : '기본 앱 (미설정)'], ...profiles.map((a) => [a.id, a.name || a.clientId])])
        : text('Name', 'name', { placeholder: 'Coding Mode' }),
      h('div', { class: 'row small' },
        h('button', { class: 'link', onclick: async () => {
          const r = await run(() => api.call('aesthetic', S.draft, null, S.aesSeen));
          const v = r.variants[0];
          S.aesSeen.push(`${v.details} / ${v.state}`);
          load({ ...S.draft, name: v.name || S.draft.name, details: v.details, state: v.state }, S.draftId);
          render();
        } }, '다시 꾸미기'),
        h('span', { class: 'faint' }, '·'),
        h('button', { class: 'link', onclick: (e) => {
          e.stopPropagation();
          menu(e.currentTarget, (S.meta?.styles || []).map((st) => ({ label: st.label, onClick: async () => {
            const r = await run(() => api.call('applyStyle', S.draft, st.id));
            load({ ...S.draft, details: r.details, state: r.state }, S.draftId);
            render();
          } })));
        } }, '스타일'),
        h('span', { class: 'faint' }, '·'),
        h('button', { class: 'link', onclick: (e) => {
          e.stopPropagation();
          menu(e.currentTarget, (S.meta?.themes || []).map((t) => ({ label: `${t.emoji}  ${t.name}`, onClick: () => {
            load({ ...t.presence, appProfile: d.appProfile, buttons: t.presence.buttons.length ? t.presence.buttons : d.buttons });
            render();
          } })));
        } }, '프리셋'))),

    h('div', null,
      more('images', '이미지', [imageField('큰 이미지', 'largeImage', 'largeText'), imageField('작은 이미지', 'smallImage', 'smallText')]),
      more('buttons', '버튼', [0, 1].map((i) => h('div', { class: 'grid2' },
        text(`버튼 ${i + 1}`, `buttons.${i}.label`, { max: 32, placeholder: i ? 'YouTube' : 'Website' }),
        text('링크', `buttons.${i}.url`, { max: 512, placeholder: 'https://' })))),
      more('display', '표시', [
        h('div', { class: 'grid2' },
          select('활동', 'type', [[0, 'Playing'], [2, 'Listening to'], [3, 'Watching'], [5, 'Competing in']]),
          select('멤버 목록', 'statusDisplay', [['name', 'Name'], ['details', 'Details'], ['state', 'State']])),
        h('div', { class: 'grid2' },
          select('시간', 'timestamps.mode', [['none', '없음'], ['session', '경과'], ['app', '앱 시작부터'], ['countdown', '카운트다운'], ['clock', '현재 시각'], ['custom', '특정 시각부터']], () => render()),
          d.timestamps.mode === 'countdown' ? text('분', 'timestamps.minutes', { type: 'number' })
            : d.timestamps.mode === 'custom' ? text('시작', 'timestamps.start', { type: 'datetime-local' }) : h('div')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.party.enabled, onchange: (e) => { d.party.enabled = e.target.checked; render(); } }), '파티 인원'),
        d.party.enabled ? h('div', { class: 'grid2' }, text('현재', 'party.size', { type: 'number' }), text('최대', 'party.max', { type: 'number' })) : null,
        h('div', { class: 'hint' }, '변수  ', (S.meta?.variables || []).map((v) => `{${v.key}}`).join('  ')),
      ]),
      s.transport.startsWith('gateway')
        ? more('gateway', '게이트웨이', [
            h('div', { class: 'grid2' },
              select('상태', 'userStatus', [['online', '온라인'], ['idle', '자리 비움'], ['dnd', '방해 금지'], ['invisible', '오프라인 표시']]),
              text('커스텀 이모지', 'customStatus.emoji', { max: 8 })),
            s.transport === 'gateway-user' ? text('커스텀 상태', 'customStatus.text') : null,
          ])
        : null));

  previewEl = h('div');
  sideInfo = h('div', { class: 'stack', style: { gap: '4px' } });
  const side = h('aside', { class: 'editor-side' },
    previewEl,
    h('button', { class: 'btn primary block', onclick: () => run(() => api.call('applyPresence', S.draft), '적용했습니다') }, '적용'),
    h('div', { class: 'row small', style: { justifyContent: 'space-between' } },
      h('button', { class: 'link', onclick: saveDialog }, '저장'),
      h('button', { class: 'link', onclick: () => timerDialog(S.draft) }, '임시 적용'),
      h('button', { class: 'link', onclick: () => copy(shareCode(S.draft)) }, '공유'),
      h('button', { class: 'link', title: 'Discord에 표시 중인 상태로 되돌리기', onclick: () => { S.draft = null; S.variants = []; render(); } }, '되돌리기')),
    h('label', { class: 'check small muted' }, h('input', { type: 'checkbox', checked: S.liveEdit, onchange: (e) => { S.liveEdit = e.target.checked; if (S.liveEdit) changed(); } }), '입력 즉시 반영'),
    sideInfo);

  queueMicrotask(() => {
    refreshPreview();
    refreshSide();
  });
  return h('div', { class: 'editor' }, left, side);
}

function shareCode(p) {
  const bytes = new TextEncoder().encode(JSON.stringify({ l: p.name || strip(p.details) || '공유된 상태', e: isEmoji(p.largeImage) ? p.largeImage : '⭐', p }));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'DSS1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function saveDialog() {
  const ex = S.draftId ? S.snap.library.find((x) => x.id === S.draftId) : null;
  const label = h('input', { class: 'input', value: ex?.label || S.draft.name || strip(S.draft.details).slice(0, 30), placeholder: '이름' });
  const fav = h('input', { type: 'checkbox', checked: ex?.favorite ?? true });
  const emoji = isEmoji(S.draft.largeImage) ? S.draft.largeImage : ex?.emoji || '⭐';
  const actions = [];
  if (ex) actions.push({ label: '새로 저장', onClick: () => run(() => api.call('saveStatus', { label: label.value, emoji, favorite: fav.checked, presence: S.draft }), '저장했습니다') });
  actions.push({ label: ex ? '업데이트' : '저장', primary: true, onClick: async () => {
    await run(() => api.call('saveStatus', { id: ex?.id, label: label.value, emoji, favorite: fav.checked, presence: S.draft }), '저장했습니다');
    if (!ex) S.draftId = S.snap.library.at(-1)?.id || null;
  } });
  modal('라이브러리에 저장', h('div', { class: 'stack' }, label, h('label', { class: 'check small' }, fav, '즐겨찾기')), actions);
}

function timerDialog(presence, statusId) {
  const minutes = h('input', { class: 'input', type: 'number', min: 1, value: 30 });
  const label = h('input', { class: 'input', placeholder: '이름 (선택)' });
  const start = (m, l, p) => run(() => api.call('startTimer', { minutes: m, label: l, presence: p || undefined, statusId: p ? undefined : statusId }), `${m}분 동안 적용`);
  const close = modal('임시 적용', h('div', { class: 'stack' },
    h('div', { class: 'hint' }, '시간이 끝나면 원래 상태로 돌아갑니다.'),
    h('div', { class: 'grid2' }, minutes, label),
    h('div', { class: 'row' }, TIMERS.map((t) => h('button', { class: 'chip', onclick: () => {
      start(t.m, t.l, { ...t.p, name: t.l, largeText: t.l, timestamps: { mode: 'countdown', minutes: t.m }, appProfile: S.snap.current?.appProfile || '' });
      close();
    } }, `${t.l} ${t.m}분`)))),
  [{ label: '시작', primary: true, onClick: () => start(Number(minutes.value), label.value, statusId ? null : presence) }]);
}

// ───────── library ─────────
function libItem(x, i) {
  const active = S.snap.currentStatusId === x.id && S.snap.mode === 'manual';
  const lib = S.snap.library;
  const apply = () => run(() => api.call('applyStatus', x.id), `${x.label} 적용`);
  return h('div', { class: `item ${active ? 'active' : ''}` },
    h('div', { class: 'e' }, isEmoji(x.emoji) ? x.emoji : '·'),
    h('div', { class: 't ellipsis', style: { cursor: 'pointer' }, title: '클릭하여 적용', onclick: apply },
      h('b', null, x.label), h('span', { class: 'muted small' }, `   ${[x.presence.details, x.presence.state].filter(Boolean).join(' · ')}`)),
    h('div', { class: 'actions' },
      h('button', { class: `icon-btn star ${x.favorite ? 'on' : ''}`, title: '즐겨찾기', onclick: () => run(() => api.call('toggleFavorite', x.id)) }, x.favorite ? '★' : '☆'),
      h('button', { class: 'icon-btn', title: '더보기', onclick: (e) => {
        e.stopPropagation();
        menu(e.currentTarget, [
          { label: '적용', onClick: apply },
          { label: '편집', onClick: () => { load(x.presence, x.id); go('editor'); } },
          { label: '임시 적용…', onClick: () => timerDialog(null, x.id) },
          { label: '공유 코드 복사', onClick: async () => copy(await api.call('shareCode', x.id)) },
          { label: '복제', onClick: () => run(() => api.call('duplicateStatus', x.id)) },
          '-',
          ...(i > 0 ? [{ label: '위로', onClick: () => run(() => api.call('moveStatus', x.id, -1)) }] : []),
          ...(i < lib.length - 1 ? [{ label: '아래로', onClick: () => run(() => api.call('moveStatus', x.id, 1)) }] : []),
          { label: '삭제', onClick: () => modal('삭제할까요?', h('div', { class: 'muted' }, x.label), [{ label: '삭제', primary: true, onClick: () => run(() => api.call('deleteStatus', x.id)) }]) },
        ]);
      } }, '⋯')));
}

function pageLibrary() {
  const q = S.query.toLowerCase();
  const all = S.snap.library;
  const list = all.filter((x) => !q || `${x.label} ${x.presence.details} ${x.presence.state}`.toLowerCase().includes(q));
  const sorted = [...list.filter((x) => x.favorite), ...list.filter((x) => !x.favorite)];
  const search = h('input', {
    class: 'input', style: { maxWidth: '200px' }, placeholder: '검색', value: S.query,
    oninput: (e) => {
      S.query = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = pageEl.querySelector('input');
      el.focus();
      el.setSelectionRange(pos, pos);
    },
  });
  const st = S.snap.stats || { seconds: {} };
  const entries = Object.entries(st.seconds || {}).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  return h('div', null,
    h('div', { class: 'page-head' }, h('h1', null, '라이브러리'), h('span', { class: 'spacer' }), all.length > 5 || q ? search : null,
      h('button', { class: 'icon-btn', title: '가져오기 · 내보내기', onclick: (e) => {
        e.stopPropagation();
        menu(e.currentTarget, [
          { label: '공유 코드로 가져오기…', onClick: () => {
            const input = h('input', { class: 'input', placeholder: 'DSS1.…' });
            modal('공유 코드', input, [{ label: '가져오기', primary: true, onClick: () => run(() => api.call('importShareCode', input.value), '추가했습니다') }]);
          } },
          { label: 'JSON 내보내기', onClick: exportJson },
          { label: 'JSON 가져오기…', onClick: importJson },
        ]);
      } }, '⋯')),
    sorted.length
      ? h('div', { class: 'list' }, sorted.map((x) => libItem(x, all.indexOf(x))))
      : h('div', { class: 'muted' }, all.length ? '결과 없음' : '저장된 상태가 없습니다. 에디터에서 저장하세요.'),
    h('div', { style: { marginTop: '32px' } },
      more('stats', `오늘 · 변경 ${st.changes || 0}회`, [
        entries.length
          ? entries.slice(0, 10).map(([k, v]) => h('div', { class: 'bar' }, h('span', { class: 'ellipsis' }, k), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${Math.max(2, (v / max) * 100)}%` } })), h('span', { class: 'v' }, dur(v))))
          : h('div', { class: 'hint' }, '기록 없음'),
        S.snap.history.length ? h('div', { class: 'stack', style: { gap: '2px', marginTop: '8px' } }, S.snap.history.slice(0, 15).map((x) => h('div', { class: 'small ellipsis' }, h('span', { class: 'faint' }, `${hm(x.at)}  `), x.summary))) : null,
        h('div', { class: 'row small' }, h('button', { class: 'link', onclick: () => run(() => api.call('clearHistory')) }, '기록 지우기'), h('button', { class: 'link', onclick: () => run(() => api.call('resetStats')) }, '통계 초기화')),
      ])));
}

async function exportJson() {
  const data = await run(() => api.call('exportData'));
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `discord-status-studio-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
}
function importJson() {
  const input = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
    const f = input.files[0];
    if (f) await run(async () => api.call('importData', await f.text(), { merge: true }), '가져왔습니다');
  } });
  input.click();
}

// ───────── automation ─────────
function autoLine() {
  const a = S.snap.agent;
  return `표시 중 · ${(S.snap.live?.label || '—').replace(/^\S+\s/, '')}${a ? `   ·   에이전트 ${a.host || ''} ${Math.round((Date.now() - a.at) / 1000)}초 전` : ''}`;
}
function refreshAuto() {
  pageEl.querySelectorAll('.rule').forEach((el) => el.classList.toggle('live', S.snap.live?.key === `rule:${el.dataset.id}`));
  const info = pageEl.querySelector('#auto-live');
  if (info) info.textContent = autoLine();
  pageEl.querySelectorAll('.seg button[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.snap.mode));
}

function dirty(rerender = true) {
  S.rulesDirty = true;
  if (rerender) render();
  else pageEl.querySelector('#save-rules')?.removeAttribute('disabled');
}

function ruleRow(r, i) {
  const rules = S.rules;
  const inp = (key, props = {}) => h('input', { class: 'input', value: r[key] ?? '', ...props, oninput: (e) => { r[key] = e.target.value; dirty(false); } });
  let cond;
  if (r.type === 'process') cond = [inp('match', { placeholder: 'Code.exe, chrome, title:Minecraft*' })];
  else if (r.type === 'schedule') {
    cond = [inp('from', { type: 'time' }), inp('to', { type: 'time' }),
      h('div', { class: 'days' }, '일월화수목금토'.split('').map((d, di) => h('button', { class: !r.days?.length || r.days.includes(di) ? 'on' : '', onclick: () => {
        let days = r.days?.length ? [...r.days] : [0, 1, 2, 3, 4, 5, 6];
        days = days.includes(di) ? days.filter((x) => x !== di) : [...days, di].sort();
        r.days = days.length === 7 ? [] : days;
        dirty();
      } }, d)))];
  } else cond = [inp('minutes', { type: 'number', min: 1, style: { width: '80px' } }), h('span', { class: 'small muted' }, '분 입력 없음')];

  return h('div', { class: `rule ${r.enabled === false ? 'off' : ''} ${S.snap.live?.key === `rule:${r.id}` ? 'live' : ''}`, 'data-id': r.id },
    h('input', { type: 'checkbox', checked: r.enabled !== false, title: '사용', style: { accentColor: 'var(--accent)' }, onchange: (e) => { r.enabled = e.target.checked; dirty(); } }),
    h('select', { class: 'input', onchange: (e) => { r.type = e.target.value; dirty(); } }, [['process', '프로그램'], ['schedule', '시간'], ['idle', '자리비움']].map(([v, l]) => h('option', { value: v, selected: r.type === v || null }, l))),
    h('div', { class: 'cond' }, cond),
    h('select', { class: 'input status', onchange: (e) => { r.statusId = e.target.value; dirty(false); } },
      h('option', { value: '' }, '상태 선택'),
      S.snap.library.map((x) => h('option', { value: x.id, selected: x.id === r.statusId || null }, x.label))),
    h('button', { class: 'icon-btn', onclick: (e) => {
      e.stopPropagation();
      menu(e.currentTarget, [
        ...(i > 0 ? [{ label: '위로', onClick: () => { [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]]; dirty(); } }] : []),
        ...(i < rules.length - 1 ? [{ label: '아래로', onClick: () => { [rules[i + 1], rules[i]] = [rules[i], rules[i + 1]]; dirty(); } }] : []),
        { label: '삭제', onClick: () => { rules.splice(i, 1); dirty(); } },
      ]);
    } }, '⋯'));
}

function pageAuto() {
  if (!S.rules) {
    S.rules = clone(S.snap.rules);
    S.rulesDirty = false;
  }
  if (!S.rotation) S.rotation = clone(S.snap.rotation);
  const rules = S.rules;
  const rot = S.rotation;
  const add = (type, extra = {}) => {
    rules.push({ id: crypto.randomUUID(), enabled: true, type, match: '', from: '09:00', to: '18:00', days: [], minutes: 10, statusId: '', ...extra });
    dirty();
  };
  const saveBtn = h('button', { id: 'save-rules', class: 'btn primary', disabled: !S.rulesDirty || null, onclick: async () => {
    await run(() => api.call('setRules', rules), '저장했습니다');
    S.rules = null;
    render();
  } }, '저장');

  return h('div', null,
    h('div', { class: 'page-head' }, h('h1', null, '자동화'), h('span', { class: 'spacer' }),
      h('div', { class: 'seg' }, [['manual', '수동'], ['auto', '자동'], ['rotation', '순환']].map(([m, l]) => h('button', { 'data-mode': m, class: S.snap.mode === m ? 'on' : '', onclick: () => run(() => api.call('setMode', m)) }, l)))),
    h('div', { id: 'auto-live', class: 'hint', style: { marginBottom: '24px' } }, autoLine()),

    h('div', { class: 'row', style: { marginBottom: '4px' } }, h('span', { class: 'muted small' }, '규칙 · 위에서부터 적용'), h('span', { class: 'spacer' }), saveBtn),
    rules.length ? rules.map(ruleRow) : h('div', { class: 'hint', style: { padding: '12px 0', borderBottom: '1px solid var(--line)' } }, '규칙 없음'),
    h('div', { class: 'row small', style: { margin: '12px 0 28px' } },
      h('button', { class: 'link', onclick: () => add('process') }, '+ 프로그램'),
      h('button', { class: 'link', onclick: () => add('schedule') }, '+ 시간'),
      h('button', { class: 'link', onclick: () => add('idle') }, '+ 자리비움'),
      h('span', { class: 'spacer' }),
      h('select', { class: 'input', style: { width: 'auto' }, onchange: async (e) => {
        const id = e.target.value;
        if (!id) return;
        await run(() => api.call('addRuleFromApp', id), '추가했습니다');
        S.rules = null;
        render();
      } }, h('option', { value: '' }, '앱으로 추가…'), (S.meta?.knownApps || []).map((a) => h('option', { value: a.id }, a.label)))),

    more('procs', '실행 중인 프로그램', [
      S.procs
        ? h('div', null, S.procs.slice(0, 200).map((p) => h('div', { class: 'proc' }, h('span', { class: 'ellipsis' }, p.name), h('span', { class: 'muted ellipsis' }, p.title), h('button', { class: 'link small', onclick: () => add('process', { match: p.name }) }, '+ 규칙'))))
        : h('div', null, h('button', { class: 'btn', onclick: async () => { S.procs = await run(() => api.call('getProcesses')); S.open.procs = true; render(); } }, '불러오기')),
    ]),
    more('rotation', `순환 · ${rot.statusIds.length}개`, [
      S.snap.library.length
        ? h('div', { class: 'row' }, S.snap.library.map((x) => {
            const on = rot.statusIds.includes(x.id);
            return h('button', { class: `chip ${on ? 'on' : ''}`, onclick: () => { rot.statusIds = on ? rot.statusIds.filter((i) => i !== x.id) : [...rot.statusIds, x.id]; S.open.rotation = true; render(); } }, on ? `${rot.statusIds.indexOf(x.id) + 1}. ${x.label}` : x.label);
          }))
        : h('div', { class: 'hint' }, '라이브러리에 상태를 먼저 저장하세요.'),
      h('div', { class: 'row small' }, '간격', h('input', { class: 'input', type: 'number', min: 30, style: { width: '90px' }, value: rot.intervalSec, oninput: (e) => (rot.intervalSec = Number(e.target.value)) }), '초', h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: async () => { await run(() => api.call('setRotation', rot), '저장했습니다'); S.rotation = null; } }, '저장')),
    ]));
}

// ───────── settings ─────────
function pageSettings() {
  if (!S.settings) S.settings = clone(S.snap.settings);
  const s = S.settings;
  const desktop = api.kind === 'desktop';
  const web = api.kind === 'web';
  const inp = (key, props = {}) => h('input', { class: 'input', value: s[key] ?? '', ...props, oninput: (e) => (s[key] = props.type === 'number' ? Number(e.target.value) : e.target.value) });
  const secret = (key, ph) => h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: s[`has_${key}`] ? '저장됨' : ph, value: s[key] === '__keep__' ? '' : s[key], oninput: (e) => (s[key] = e.target.value || (s[`has_${key}`] ? '__keep__' : '')) });
  const field = (label, el, hint) => h('div', { class: 'field' }, h('label', null, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
  const check = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => (s[key] = e.target.checked) }), label);
  const save = () => run(async () => {
    const r = await api.call('setSettings', s);
    S.settings = null;
    render();
    return r;
  }, '저장했습니다');
  const profiles = s.appProfiles || (s.appProfiles = []);
  const modes = [['rpc', '로컬 앱'], ['gateway-bot', '봇'], ['gateway-user', '사용자 토큰'], ['none', '끄기']];
  const modeHint = {
    rpc: '같은 컴퓨터에서 실행 중인 Discord 앱으로 표시합니다.',
    'gateway-bot': '봇 토큰으로 봇의 상태를 24시간 표시합니다.',
    'gateway-user': '내 계정 상태를 PC 없이 유지합니다.',
    none: 'Discord로 보내지 않습니다.',
  }[s.transport];

  return h('div', { style: { maxWidth: '620px' } },
    h('div', { class: 'page-head' }, h('h1', null, '설정'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: save }, '저장')),

    h('div', { class: 'section' },
      h('h2', null, 'Discord'),
      h('div', { class: 'stack' },
        h('div', null, h('div', { class: 'seg' }, modes.map(([v, l]) => h('button', { class: s.transport === v ? 'on' : '', onclick: () => { s.transport = v; render(); } }, l)))),
        h('div', { class: 'hint' }, modeHint),
        s.transport === 'gateway-user' ? h('div', { class: 'note warn' }, '사용자 토큰 자동화(셀프봇)는 Discord 약관 위반이며 계정이 정지될 수 있습니다. 토큰은 절대 공유하지 마세요.') : null,
        s.transport === 'rpc'
          ? [
              field('Application ID', inp('clientId', { placeholder: '123456789012345678', inputmode: 'numeric' }),
                h('span', null, h('a', { href: 'https://discord.com/developers/applications', target: '_blank', rel: 'noreferrer' }, 'Developer Portal'), '에서 앱을 만들고 ID를 복사하세요. 앱 이름이 "Playing ○○"로 표시됩니다.')),
              more('profiles', `앱 프로필 · ${profiles.length}`, [
                h('div', { class: 'hint' }, 'Name을 여러 개 쓰려면 이름별로 앱을 만들어 등록하세요.'),
                profiles.map((a, i) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
                  h('input', { class: 'input', placeholder: '표시 이름', value: a.name, oninput: (e) => (a.name = e.target.value) }),
                  h('input', { class: 'input', placeholder: 'Application ID', value: a.clientId, oninput: (e) => (a.clientId = e.target.value) }),
                  h('button', { class: 'icon-btn', onclick: () => { profiles.splice(i, 1); render(); } }, '×'))),
                h('div', null, h('button', { class: 'link small', onclick: () => { profiles.push({ id: crypto.randomUUID(), name: '', clientId: '' }); S.open.profiles = true; render(); } }, '+ 추가')),
              ]),
            ]
          : null,
        s.transport.startsWith('gateway')
          ? [
              field(s.transport === 'gateway-bot' ? '봇 토큰' : '사용자 토큰', secret('discordToken', '토큰')),
              s.transport === 'gateway-user' ? field('Application ID (선택)', inp('gatewayAppId', { inputmode: 'numeric' }), '이미지를 표시하려면 필요합니다.') : null,
            ]
          : null,
        h('div', null, h('button', { class: 'link small', onclick: async () => { await save(); await run(() => api.call('reconnect')); } }, '저장 후 다시 연결')))),

    h('div', { class: 'section' },
      h('h2', null, 'AI · OpenRouter'),
      h('div', { class: 'stack' },
        field('API 키', secret('openrouterKey', 'sk-or-…'), h('span', null, '없으면 오프라인 생성기를 씁니다. ', h('a', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noreferrer' }, '키 발급'))),
        modelField(s))),

    h('div', { class: 'section' },
      h('h2', null, '일반'),
      h('div', { class: 'stack' },
        h('div', null, h('div', { class: 'seg' }, [['dark', '다크'], ['light', '라이트'], ['system', '시스템']].map(([v, l]) => h('button', { class: s.uiTheme === v ? 'on' : '', onclick: () => { s.uiTheme = v; render(); } }, l)))),
        check('notifyOnChange', '자동으로 바뀌면 알림'),
        desktop ? [check('autoStart', 'PC 시작 시 실행'), check('startHidden', '트레이로 시작'), check('hotkeys', '단축키 (Ctrl+Alt+←/→, 1–9, P, S)')] : null,
        more('advanced', '고급', [
          h('div', { class: 'grid2' }, field('감지 주기 (초)', inp('pollSeconds', { type: 'number', min: 3 })), field('최소 업데이트 간격 (초)', inp('minUpdateSeconds', { type: 'number', min: 4 }))),
        ]))),

    desktop
      ? h('div', { class: 'section' },
          h('h2', null, '원격 서버'),
          h('div', { class: 'stack' },
            h('div', { class: 'hint' }, '실행 중인 프로그램을 Linux 서버로 보내 서버 규칙이 반응하게 합니다.'),
            check('remoteEnabled', '서버로 보고'),
            h('div', { class: 'grid2' }, field('주소', inp('remoteUrl', { placeholder: 'https://status.example.com' })), field('API 토큰', secret('remoteToken', 'dss_…')))))
      : null,

    web ? serverSections(s, check, field, inp) : null,

    h('div', { class: 'section' },
      h('h2', null, '데이터'),
      h('div', { class: 'row small' }, h('button', { class: 'link', onclick: exportJson }, '내보내기'), h('button', { class: 'link', onclick: importJson }, '가져오기'))));
}

function modelField(s) {
  const input = h('input', { class: 'input', list: 'models', value: s.aiModel || '', placeholder: S.meta?.defaultModel || 'openrouter/auto', oninput: (e) => (s.aiModel = e.target.value.trim()) });
  const list = h('datalist', { id: 'models' }, (S.models || []).map((m) => h('option', { value: m.id }, m.name)));
  const btn = h('button', { class: 'btn', onclick: async () => {
    btn.disabled = true;
    try {
      S.models = await run(() => api.call('listAiModels'));
      list.replaceChildren(...S.models.map((m) => h('option', { value: m.id }, m.name)));
      btn.textContent = `${S.models.length}개`;
      input.focus();
    } finally {
      btn.disabled = false;
    }
  } }, S.models ? `${S.models.length}개` : '목록');
  return h('div', { class: 'field' }, h('label', null, '모델'), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, input, btn), list,
    h('div', { class: 'hint' }, h('code', null, 'openrouter/auto'), ' 는 알맞은 모델을 자동으로 고릅니다.'));
}

function serverSections(s, check, field, inp) {
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  if (!S.tokens) api.listTokens().then((r) => { S.tokens = r.tokens; if (S.page === 'settings') render(); }).catch(() => {});
  const cur = h('input', { class: 'input', type: 'password', placeholder: '현재 비밀번호' });
  const next = h('input', { class: 'input', type: 'password', placeholder: '새 비밀번호' });
  const name = h('input', { class: 'input', placeholder: '토큰 이름' });
  return [
    h('div', { class: 'section' },
      h('h2', null, '공개'),
      h('div', { class: 'stack' },
        check('publicStatus', '공개 상태 API · 배지'),
        field('공개 주소', inp('publicUrl', { placeholder: base.replace(/\/$/, '') }), '업로드한 이미지 URL에 사용됩니다.'),
        s.publicStatus ? h('div', { class: 'hint' }, h('code', null, `${base}api/public/status`), h('br'), h('code', null, `${base}badge.svg`)) : null)),
    h('div', { class: 'section' },
      h('h2', null, 'API 토큰'),
      h('div', { class: 'stack' },
        S.newToken ? h('div', { class: 'note' }, h('code', null, S.newToken), '  ', h('button', { class: 'link', onclick: () => copy(S.newToken) }, '복사')) : null,
        (S.tokens || []).map((t) => h('div', { class: 'row small' }, h('span', null, t.name), h('span', { class: 'faint' }, t.lastUsed ? new Date(t.lastUsed).toLocaleDateString() : ''), h('span', { class: 'spacer' }),
          h('button', { class: 'link bad', onclick: async () => { await run(() => api.revokeToken(t.id)); S.tokens = null; render(); } }, '삭제'))),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, name, h('button', { class: 'btn', onclick: async () => {
          const r = await run(() => api.createToken(name.value || 'token'));
          S.newToken = r.token;
          S.tokens = null;
          render();
        } }, '발급')),
        h('div', { class: 'hint' }, h('code', null, `curl -X POST ${base}api/quick -H "Authorization: Bearer TOKEN" -d '{"text":"coding"}'`)))),
    h('div', { class: 'section' },
      h('h2', null, '계정'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, cur, next),
        h('div', { class: 'row small' },
          h('button', { class: 'link', onclick: () => run(() => api.changePassword(cur.value, next.value), '변경했습니다') }, '비밀번호 변경'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'link bad', onclick: async () => { await api.logout(); location.reload(); } }, '로그아웃')))),
  ];
}

// ───────── login ─────────
function showLogin() {
  const pw = h('input', { class: 'input', type: 'password', placeholder: '비밀번호', autocomplete: 'current-password' });
  const err = h('div', { class: 'small', style: { color: 'var(--bad)', minHeight: '18px' } });
  app.replaceChildren(h('div', { class: 'login' }, h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api.login(pw.value);
      boot();
    } catch (ex) {
      err.textContent = ex.message;
    }
  } }, h('h1', { style: { fontSize: '16px', marginBottom: '6px' } }, 'Status Studio'), pw, err, h('button', { class: 'btn primary block', type: 'submit' }, '로그인'))));
  pw.focus();
}

// ───────── boot ─────────
async function boot() {
  try {
    const sess = await api.session();
    if (!sess.authed) return showLogin();
    const [snap, meta] = await Promise.all([api.call('getSnapshot'), api.call('getMeta')]);
    S.snap = snap;
    S.meta = meta;
    applyTheme();
    buildShell();
    const hash = location.hash.slice(1);
    if (NAV.some(([id]) => id === hash)) S.page = hash;
    render();
    api.onSnapshot((s) => setSnap(s));
    api.onNavigate?.((p) => go(NAV.some(([id]) => id === p) ? p : 'editor'));
  } catch (e) {
    if (e instanceof AuthError) return showLogin();
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'stack' }, h('div', null, '연결할 수 없습니다'), h('div', { class: 'muted small' }, e.message), h('button', { class: 'btn', onclick: boot }, '다시 시도'))));
  }
}

addEventListener('hashchange', () => {
  const p = location.hash.slice(1);
  if (S.snap && NAV.some(([id]) => id === p) && p !== S.page) go(p);
});

boot();
