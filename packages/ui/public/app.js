import { createApi, AuthError } from './api.js';

const api = createApi();

// ───────────────────────── state ─────────────────────────
const S = {
  snap: null,
  meta: null,
  page: 'editor',
  draft: null,
  draftId: null,
  draftOpenedAt: Date.now(),
  variants: [],
  variantSource: '',
  aiBusy: false,
  aesSeen: [],
  liveEdit: false,
  procs: null,
  rulesDraft: null,
  rotationDraft: null,
  settingsDraft: null,
  tokens: null,
  newToken: null,
  libQuery: '',
};

const NAV = [
  ['editor', '🎨', '에디터'],
  ['themes', '✨', '테마'],
  ['library', '📚', '라이브러리'],
  ['auto', '🤖', '자동화'],
  ['timer', '⏱️', '타이머'],
  ['stats', '📊', '통계'],
  ['settings', '⚙️', '설정'],
];

const TYPE_LABEL = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };

const EMOJIS = ('⚡ ⌨️ 💻 🧑‍💻 🛠️ 🌐 🚀 🔥 ✨ 💫 🌙 🌃 ☕ 🎮 🕹️ 👾 🏆 🎯 ⚔️ 🛡️ ⛏️ 🌲 🧱 💎 🎵 🎧 🎶 🎹 🎛️ 📚 ✏️ 📝 🍅 📖 😴 💤 🌿 💼 📊 🎨 🖌️ 🎬 ✂️ 📺 🔴 🎙️ 🤖 🧠 🌸 🍿 💪 🏋️ 🍜 🍕 ✈️ 🗺️ 🧊 💠 🖤 🍎 💜 💚 💙 ❤️ 🧡 💛 🤍 🟢 🟡 🔵 🟣 ⚪ ⭐ 🌈 ☁️ 🌧️ ❄️ 🪐 👀 😎 🥱 🫠 🦊 🐱 🐶 🐧 🦉 👑 💀 🎲 🧩 🔮 📡 🧪 🔧 ⚙️ 🔒 🏠 🎁 🎉').split(' ');

// ───────────────────────── tiny DOM helper ─────────────────────────
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
      else if (k === 'html') el.innerHTML = v;
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
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3000);
}

async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (r && r.connection && r.mode) setSnap(r);
    if (okMsg) toast(okMsg, 'ok');
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
  toast('클립보드에 복사했습니다', 'ok');
}

function modal(title, body, actions = []) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => e.target === bg && bg.remove() });
  const close = () => bg.remove();
  bg.append(h('div', { class: 'modal' }, h('h2', null, title), body, h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'flex-end' } }, actions.map((a) => h('button', { class: `btn ${a.class || ''}`, onclick: async () => { if ((await a.onClick?.()) !== false) close(); } }, a.label)), h('button', { class: 'btn ghost', onclick: close }, '닫기'))));
  document.body.append(bg);
  bg.querySelector('input, textarea')?.focus();
  return close;
}

// ───────────────────────── presence helpers (mirrors core/presence.js) ─────────────────────────
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️\u{1F3FB}-\u{1F3FF}⃣#*0-9])+$/u;
function isEmojiOnly(s) {
  return typeof s === 'string' && s.trim() && EMOJI_ONLY.test(s.trim()) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
}
function twemoji(e) {
  const cps = Array.from(e.trim()).map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== 'fe0f');
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${cps.join('-')}.png`;
}
function imageSrc(v) {
  v = (v || '').trim();
  if (!v) return null;
  if (isEmojiOnly(v)) return { src: twemoji(v), emoji: true };
  if (/^https?:\/\//.test(v)) return { src: v, emoji: false };
  return { key: v };
}
function imgEl(v, cls = '') {
  const r = imageSrc(v);
  if (!r) return null;
  if (r.key) return h('span', { class: 'small muted', title: 'Discord 에셋 키' }, r.key.slice(0, 8));
  return h('img', { src: r.src, class: r.emoji ? `emoji ${cls}` : cls, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => (e.target.style.opacity = 0.2) });
}
function emptyPresence() {
  return { name: '', type: 0, details: '', state: '', largeImage: '', largeText: '', smallImage: '', smallText: '', buttons: [], timestamps: { mode: 'session', minutes: 25, start: '' }, party: { enabled: false, size: 1, max: 4 }, statusDisplay: 'name', appProfile: '', userStatus: 'online', customStatus: { emoji: '', text: '' } };
}
function fillPresence(p) {
  const b = emptyPresence();
  return { ...b, ...clone(p || {}), timestamps: { ...b.timestamps, ...(p?.timestamps || {}) }, party: { ...b.party, ...(p?.party || {}) }, customStatus: { ...b.customStatus, ...(p?.customStatus || {}) }, buttons: clone(p?.buttons || []) };
}
function chars(s) {
  return Array.from(s || '').length;
}
function fmtClock(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtDur(sec) {
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return hh ? `${hh}시간 ${mm}분` : `${mm}분`;
}
function timeOf(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function presenceTimes(p, since) {
  const t = p?.timestamps || {};
  const now = Date.now();
  if (t.mode === 'session') return { start: since };
  if (t.mode === 'app') return { start: since };
  if (t.mode === 'countdown') return { end: since + (Number(t.minutes) || 25) * 60000 };
  if (t.mode === 'clock') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { start: d.getTime() };
  }
  if (t.mode === 'custom' && Date.parse(t.start)) return { start: Date.parse(t.start) };
  return null;
}
function renderVars(s) {
  // Preview-only rendering of template variables using what the engine last saw.
  if (!s || !s.includes('{')) return s;
  const w = S.snap?.windowInfo || {};
  const d = new Date();
  const vars = {
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    date: d.toISOString().slice(0, 10),
    weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()],
    hour: String(d.getHours()),
    greeting: d.getHours() < 5 ? 'Late night' : d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening',
    ...w,
  };
  return s.replace(/\{random:([^}]*)\}/g, (_, l) => l.split('|')[0]).replace(/\{([a-z_]+)(?:\|([^}]*))?\}/gi, (m, k, fb) => vars[k.toLowerCase()] || fb || `‹${k}›`);
}

// ───────────────────────── Discord preview ─────────────────────────
function discordUser() {
  const u = S.snap?.connection?.user;
  return {
    name: u?.global_name || u?.username || 'You',
    handle: u?.username || 'your.name',
    avatar: u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
  };
}

function activityName(p) {
  const prof = S.snap?.settings?.appProfiles?.find((a) => a.id === p.appProfile);
  return renderVars(prof?.name || p.name || 'Discord Status Studio');
}

function previewProfile(p, { since = Date.now(), accent, empty } = {}) {
  const u = discordUser();
  const status = p?.userStatus || 'online';
  const cs = p?.customStatus || {};
  const card = h('div', { class: 'dc-profile', style: { '--accent': accent || 'var(--brand)' } },
    h('div', { class: 'dc-banner' },
      h('div', { class: 'dc-avatar' }, u.avatar ? h('img', { src: u.avatar, alt: '' }) : '😎'),
      h('div', { class: `dc-status ${status}` })),
  );
  const body = h('div', { class: 'dc-body' }, h('div', { class: 'dc-name' }, u.name), h('div', { class: 'dc-user' }, u.handle));
  const gw = S.snap?.settings?.transport?.startsWith('gateway-user');
  if (p && gw && (cs.text || cs.emoji)) body.append(h('div', { class: 'dc-custom' }, `${cs.emoji || ''} ${renderVars(cs.text || '')}`));
  if (!p || empty) {
    body.append(h('div', { class: 'dc-activity' }, h('div', { class: 'dc-empty' }, empty || '표시 중인 활동 없음')));
    card.append(body);
    return card;
  }
  const times = presenceTimes(p, since);
  const large = imgEl(p.largeImage);
  const small = imgEl(p.smallImage);
  const party = p.party?.enabled && p.state ? ` (${p.party.size} of ${p.party.max})` : '';
  const act = h('div', { class: 'dc-activity' },
    h('div', { class: 'dc-act-head' }, (TYPE_LABEL[p.type] || 'Playing').toUpperCase()),
    h('div', { class: 'dc-act' },
      large || small ? h('div', { class: 'dc-imgs', title: p.largeText || '' }, h('div', { class: 'dc-large' }, large), small ? h('div', { class: 'dc-small', title: p.smallText || '' }, small) : null) : null,
      h('div', { class: 'dc-lines' },
        h('div', { class: 'n' }, activityName(p)),
        p.details ? h('div', null, renderVars(p.details)) : null,
        p.state ? h('div', null, renderVars(p.state) + party) : null,
        times ? h('div', { class: 't dc-time', 'data-start': times.start || '', 'data-end': times.end || '' }, '') : null)),
    (p.buttons || []).filter((b) => b.label).length ? h('div', { class: 'dc-buttons' }, p.buttons.filter((b) => b.label).slice(0, 2).map((b) => h('div', { title: b.url }, renderVars(b.label)))) : null,
  );
  body.append(act);
  card.append(body);
  updateTimes(card);
  return card;
}

function memberPreview(p) {
  const u = discordUser();
  const st = { online: 'var(--green)', idle: 'var(--yellow)', dnd: 'var(--red)', invisible: '#80848e' }[p?.userStatus || 'online'];
  let line = '';
  if (p) {
    const pick = p.statusDisplay === 'details' ? p.details : p.statusDisplay === 'state' ? p.state : activityName(p);
    line = `${TYPE_LABEL[p.type] || 'Playing'} ${renderVars(pick || activityName(p))}`;
  }
  return h('div', { class: 'dc-member', style: { '--st': st } }, h('div', { class: 'av' }, u.avatar ? h('img', { src: u.avatar, style: { width: '100%', borderRadius: '50%' } }) : ''), h('div', { style: { minWidth: 0 } }, h('b', null, u.name), h('span', null, line || ' ')));
}

function updateTimes(root = document) {
  const now = Date.now();
  root.querySelectorAll('.dc-time').forEach((el) => {
    const start = Number(el.dataset.start);
    const end = Number(el.dataset.end);
    if (end) el.textContent = `${fmtClock(end - now)} left`;
    else if (start) el.textContent = `${fmtClock(now - start)} elapsed`;
  });
  root.querySelectorAll('[data-countdown]').forEach((el) => (el.textContent = fmtClock(Number(el.dataset.countdown) - now)));
}
setInterval(() => updateTimes(), 1000);

// ───────────────────────── shell ─────────────────────────
const app = document.getElementById('app');
let mainEl, topEl, contentEl, navEl;

function applyUiTheme() {
  const t = S.snap?.settings?.uiTheme || 'dark';
  const resolved = t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = resolved;
}

function buildShell() {
  app.innerHTML = '';
  navEl = h('nav', { class: 'side' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '' }), h('div', null, 'Status Studio', h('small', null, api.kind === 'desktop' ? 'Windows' : 'Server Dashboard'))),
    NAV.map(([id, ico, label]) => h('button', { class: 'nav-btn', 'data-page': id, onclick: () => go(id) }, h('span', { class: 'ico' }, ico), label)),
    h('div', { class: 'side-foot' }, 'Discord Status Studio v1.0'));
  topEl = h('header', { class: 'topbar' });
  contentEl = h('section', { class: 'content' });
  mainEl = h('main', { class: 'main' }, topEl, contentEl);
  app.append(h('div', { class: 'shell' }, navEl, mainEl));
}

function go(page) {
  S.page = page;
  if (page === 'auto') S.rulesDraft = null;
  if (page === 'settings') S.settingsDraft = null;
  renderPage();
  contentEl.scrollTop = 0;
}

function connInfo() {
  const c = S.snap.connection || {};
  const map = {
    connected: ['ok', `연결됨${c.user ? ` · ${c.user.global_name || c.user.username}` : ''}`],
    connecting: ['warn', '연결 중…'],
    disconnected: ['err', c.error || 'Discord 연결 안 됨'],
    error: ['err', c.error || '오류'],
    disabled: ['', 'Discord 전송 꺼짐'],
  };
  return map[c.status] || ['', c.status];
}

function renderTop() {
  if (!S.snap) return;
  const [cls, text] = connInfo();
  const live = S.snap.live;
  const p = live?.presence;
  topEl.replaceChildren(
    h('span', { class: 'pill', title: text }, h('span', { class: `dot ${cls}` }), h('span', { style: { maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' } }, text)),
    h('div', { class: 'grow' },
      h('div', { class: 'live-label' }, live?.label || ''),
      h('div', { class: 'live-sub' }, p ? [p.details, p.state].filter(Boolean).join(' · ') : '표시 중인 상태 없음')),
    h('div', { class: 'seg' }, [['manual', '✋ 수동'], ['auto', '🤖 자동'], ['rotation', '🔁 순환']].map(([m, l]) => h('button', { class: S.snap.mode === m && !S.snap.paused ? 'on' : '', onclick: () => run(() => api.call('setMode', m)) }, l))),
    S.snap.paused
      ? h('button', { class: 'btn green sm', onclick: () => run(() => api.call('setPaused', false)) }, '▶ 재개')
      : h('button', { class: 'btn sm', onclick: () => run(() => api.call('setPaused', true)) }, '⏸ 일시정지'),
  );
  navEl.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === S.page));
}

function setSnap(snap) {
  const first = !S.snap;
  S.snap = snap;
  applyUiTheme();
  if (first) return;
  renderTop();
  // Pages with live data re-render; form pages only refresh their live bits.
  if (['library', 'timer', 'stats', 'themes'].includes(S.page)) renderPage();
  else if (S.page === 'editor') refreshEditorLive();
  else if (S.page === 'auto') refreshAutoLive();
}

function renderPage() {
  renderTop();
  const pages = { editor: pageEditor, themes: pageThemes, library: pageLibrary, auto: pageAuto, timer: pageTimer, stats: pageStats, settings: pageSettings };
  const scroll = contentEl.scrollTop;
  contentEl.replaceChildren(pages[S.page]());
  contentEl.scrollTop = scroll;
}

// ───────────────────────── editor page ─────────────────────────
let liveTimer;
function draftChanged({ rerenderForm = false } = {}) {
  if (rerenderForm) return renderPage();
  refreshPreview();
  if (S.liveEdit) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => run(() => api.call('updateCurrent', S.draft)), 400);
  }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  });
  o[keys.at(-1)] = val;
}

let emojiTarget = null;
function openEmojiPicker(anchor, onPick) {
  document.querySelector('.popover')?.remove();
  const r = anchor.getBoundingClientRect();
  const pop = h('div', { class: 'popover', style: { top: `${Math.min(r.bottom + 6, innerHeight - 220)}px`, left: `${Math.max(8, Math.min(r.left, innerWidth - 310))}px` } },
    h('div', { class: 'emoji-grid' }, EMOJIS.map((e) => h('button', { onclick: () => { onPick(e); pop.remove(); } }, e))));
  document.body.append(pop);
  setTimeout(() => document.addEventListener('click', function off(ev) {
    if (!pop.contains(ev.target)) {
      pop.remove();
      document.removeEventListener('click', off);
    }
  }), 0);
}

function textField(label, path, { max = 128, placeholder = '', emoji = true, hint } = {}) {
  const val = getPath(S.draft, path) || '';
  const count = h('span', { class: 'count' }, `${chars(val)}/${max}`);
  const input = h('input', {
    class: 'input', value: val, placeholder, maxlength: String(max * 2),
    oninput: (e) => {
      setPath(S.draft, path, e.target.value);
      const n = chars(e.target.value);
      count.textContent = `${n}/${max}`;
      count.classList.toggle('over', n > max);
      draftChanged();
    },
    onfocus: (e) => (emojiTarget = e.target),
  });
  const insert = (em) => {
    const pos = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, pos) + em + input.value.slice(pos);
    input.dispatchEvent(new Event('input'));
    input.focus();
  };
  return h('div', { class: 'field' },
    h('label', null, label, count),
    h('div', { class: 'input-wrap' }, input, emoji ? h('button', { class: 'btn icon', title: '이모지', onclick: (e) => openEmojiPicker(e.currentTarget, insert) }, '😀') : null),
    hint ? h('div', { class: 'hint' }, hint) : null);
}

function imageField(label, path, textPath) {
  const val = getPath(S.draft, path) || '';
  const thumb = h('div', { class: 'img-thumb' }, imgEl(val));
  const input = h('input', {
    class: 'input', value: val, placeholder: '이모지 · https:// 이미지 URL · 에셋 키',
    oninput: (e) => {
      setPath(S.draft, path, e.target.value.trim());
      thumb.replaceChildren(imgEl(e.target.value) || '');
      draftChanged();
    },
  });
  const set = (v) => {
    input.value = v;
    input.dispatchEvent(new Event('input'));
  };
  const upload = api.kind === 'web'
    ? h('label', { class: 'btn icon', title: '이미지 업로드 (서버에 호스팅)' }, '📤', h('input', {
        type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', class: 'hidden',
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const r = await run(() => api.upload(f), '업로드 완료');
          if (r?.url) set(r.url);
        },
      }))
    : null;
  return h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('label', null, label),
      h('div', { class: 'img-field' }, thumb, input, h('button', { class: 'btn icon', title: '이모지를 이미지로', onclick: (e) => openEmojiPicker(e.currentTarget, set) }, '😀'), upload, val ? h('button', { class: 'btn icon', title: '지우기', onclick: () => set('') }, '✕') : null)),
    textField(`${label} 툴팁`, textPath, { max: 128, placeholder: '마우스를 올리면 보이는 글' }));
}

function selectField(label, path, options, { onChange, hint } = {}) {
  const val = String(getPath(S.draft, path) ?? '');
  return h('div', { class: 'field' }, h('label', null, label),
    h('select', {
      class: 'input',
      onchange: (e) => {
        const raw = e.target.value;
        setPath(S.draft, path, /^\d+$/.test(raw) && path === 'type' ? Number(raw) : raw);
        onChange ? onChange(raw) : draftChanged();
      },
    }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === val ? true : null }, l))),
    hint ? h('div', { class: 'hint' }, hint) : null);
}

function ensureDraft() {
  if (!S.draft) {
    S.draft = fillPresence(S.snap.current);
    S.draftId = S.snap.currentStatusId;
    S.draftOpenedAt = Date.now();
  }
}

function loadDraft(p, id = null) {
  S.draft = fillPresence(p);
  S.draftId = id;
  S.draftOpenedAt = Date.now();
}

let previewBox, memberBox, liveBox;
function refreshPreview() {
  if (!previewBox) return;
  const accent = S.meta?.themes?.find((t) => t.presence.details === S.draft.details)?.accent;
  previewBox.replaceChildren(previewProfile(S.draft, { since: S.draftOpenedAt, accent }));
  memberBox.replaceChildren(memberPreview(S.draft));
}

function refreshEditorLive() {
  if (!liveBox) return;
  const live = S.snap.live;
  liveBox.replaceChildren(
    h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Discord에 표시 중:'), h('b', null, live?.label || '')),
    live?.presence ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, [live.presence.details, live.presence.state].filter(Boolean).join(' · ')) : null,
    S.snap.mode !== 'manual' && !S.snap.paused ? h('div', { class: 'hint', style: { marginTop: '6px' } }, `현재 ${S.snap.mode === 'auto' ? '자동' : '순환'} 모드입니다. "적용"을 누르면 수동 모드로 바뀝니다.`) : null,
  );
}

function onboardingBanner() {
  const s = S.snap.settings;
  if (s.transport === 'rpc' && !s.clientId) {
    return h('div', { class: 'warn-box', style: { marginBottom: '14px' } },
      h('b', null, '👋 시작하기: '), 'Discord Application ID가 필요합니다. ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); go('settings'); } }, '설정에서 입력하기 →'));
  }
  const c = S.snap.connection;
  if (c.status === 'error' || (c.status === 'disconnected' && c.error)) {
    return h('div', { class: 'err-box', style: { marginBottom: '14px' } }, `⚠️ ${c.error}`, ' ', h('button', { class: 'btn sm', onclick: () => run(() => api.call('reconnect'), '다시 연결 시도 중') }, '다시 연결'));
  }
  return null;
}

function aiCard() {
  const ai = S.snap.ai;
  const ta = h('textarea', { class: 'input', rows: 2, placeholder: '예) 게임 좋아하고 개발하는 사람 느낌으로 만들어줘 / Minecraft 서버 개발 중 mc.krl.kr' }, S.aiPrompt || '');
  ta.addEventListener('input', () => (S.aiPrompt = ta.value));
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generateBtn.click(); });
  const examples = ['게임 좋아하는 개발자', 'Minecraft 서버 개발 중 mc.krl.kr', '새벽 코딩', '공부 모드', 'lo-fi 감성 카페', '롤 랭크 올리는 중', '영상 편집 중'];
  const generateBtn = h('button', {
    class: 'btn glow', disabled: S.aiBusy || null,
    onclick: async () => {
      if (!ta.value.trim()) return toast('원하는 느낌을 입력하세요', 'err');
      S.aiBusy = true;
      renderPage();
      try {
        const r = await run(() => api.call('aiDesign', ta.value, 4));
        S.variants = r.variants;
        S.variantSource = r.source === 'ai' ? 'Claude AI' : `오프라인 생성기${r.error ? ` (AI 오류: ${r.error})` : ''}`;
      } finally {
        S.aiBusy = false;
        renderPage();
      }
    },
  }, S.aiBusy ? '⏳ 생성 중…' : ai.enabled ? '✨ AI로 만들기' : '✨ 자동 생성');
  return h('div', { class: 'card ai-box' },
    h('h3', null, '🪄 AI 자동 꾸미기', h('span', { class: 'right small muted' }, ai.enabled ? `Claude · ${ai.model}` : '오프라인 모드 (설정에서 API 키 입력 시 Claude 사용)')),
    h('div', { class: 'stack' }, ta,
      h('div', { class: 'row' }, examples.map((ex) => h('button', { class: 'chip', onclick: () => { ta.value = ex; S.aiPrompt = ex; } }, ex)), h('span', { class: 'spacer' }), generateBtn)),
    S.variants.length ? h('div', null,
      h('div', { class: 'hint', style: { marginTop: '10px' } }, `${S.variantSource} · 클릭하면 에디터에 불러옵니다`),
      h('div', { class: 'variants' }, S.variants.map((v) => h('button', { class: 'variant', onclick: () => { loadDraft({ ...v, appProfile: S.draft.appProfile }, null); renderPage(); toast('에디터에 불러왔습니다. "적용"을 눌러 Discord에 반영하세요'); } },
        h('div', { class: 'v-img' }, imgEl(v.largeImage)),
        h('div', { class: 'v-text' }, h('b', null, v.details || v.name), h('span', null, v.state), h('span', { class: 'muted' }, v.name)))))) : null);
}

function styleCard() {
  const styles = S.meta?.styles || [];
  return h('div', { class: 'card' },
    h('h3', null, '💅 예쁜 문자열',
      h('span', { class: 'right row' },
        h('button', { class: 'btn sm', onclick: async () => {
          const st = styles[Math.floor(Math.random() * styles.length)];
          const r = await run(() => api.call('applyStyle', S.draft, st.id));
          loadDraft({ ...S.draft, details: r.details, state: r.state }, S.draftId);
          renderPage();
        } }, '🎲 다른 스타일'),
        h('button', { class: 'btn glow sm', onclick: async () => {
          const r = await run(() => api.call('aesthetic', S.draft, null, S.aesSeen));
          const v = r.variants[0];
          S.aesSeen.push(`${v.details} / ${v.state}`);
          loadDraft({ ...S.draft, name: v.name || S.draft.name, details: v.details, state: v.state }, S.draftId);
          renderPage();
          toast(r.source === 'ai' ? '✨ Claude가 새 스타일을 만들었어요' : '✨ 새 스타일 적용');
        } }, '✨ Make it aesthetic'))),
    h('div', { class: 'row' }, styles.map((st) => h('button', { class: 'chip', onclick: async () => {
      const r = await run(() => api.call('applyStyle', S.draft, st.id));
      loadDraft({ ...S.draft, details: r.details, state: r.state }, S.draftId);
      renderPage();
    } }, st.label))),
    h('div', { class: 'hint', style: { marginTop: '8px' } }, '같은 의미를 유지하면서 Discord에서 예쁘게 보이는 규칙(이모지 위치, 글자 수, 유니코드 폰트, 박스 문자)을 적용합니다.'));
}

function pageEditor() {
  ensureDraft();
  const d = S.draft;
  const s = S.snap.settings;
  const gw = s.transport.startsWith('gateway');
  const profiles = s.appProfiles || [];
  const vars = S.meta?.variables || [];

  const left = h('div', { class: 'stack' },
    onboardingBanner(),
    aiCard(),
    h('div', { class: 'card' },
      h('h3', null, '🎮 Activity', S.draftId ? h('span', { class: 'right pill' }, '📚 라이브러리 항목 편집 중') : null),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' },
          selectField('활동 종류', 'type', [[0, '🎮 Playing'], [2, '🎧 Listening to'], [3, '📺 Watching'], [5, '🏆 Competing in']]),
          profiles.length
            ? selectField('앱 (NAME)', 'appProfile', [['', `기본 앱${s.clientId ? '' : ' (미설정)'}`], ...profiles.map((a) => [a.id, a.name || a.clientId])], { onChange: () => draftChanged(), hint: 'RPC에서는 선택한 Discord 앱 이름이 NAME으로 표시됩니다' })
            : textField('NAME', 'name', { max: 128, placeholder: 'Coding Mode', hint: s.transport === 'rpc' ? 'RPC 모드: 실제 표시 이름은 Discord 앱 이름입니다. 여러 이름을 쓰려면 설정 → 앱 프로필 추가' : null })),
        profiles.length ? textField('NAME (게이트웨이/라이브러리용)', 'name', { max: 128, placeholder: 'Coding Mode' }) : null,
        textField('DETAILS', 'details', { placeholder: '⚡ Building something cool' }),
        textField('STATE', 'state', { placeholder: '⌨️ Currently coding' }),
        h('div', { class: 'hint' }, '변수: ', vars.map((v) => h('button', { class: 'chip', style: { margin: '2px' }, title: v.desc, onclick: () => {
          if (emojiTarget) {
            const tag = `{${v.key}}`;
            const pos = emojiTarget.selectionStart ?? emojiTarget.value.length;
            emojiTarget.value = emojiTarget.value.slice(0, pos) + tag + emojiTarget.value.slice(pos);
            emojiTarget.dispatchEvent(new Event('input'));
          } else toast('먼저 입력칸을 클릭하세요');
        } }, `{${v.key}}`))))),
    styleCard(),
    h('div', { class: 'card' },
      h('h3', null, '🖼️ Images'),
      h('div', { class: 'stack' },
        imageField('큰 이미지', 'largeImage', 'largeText'),
        imageField('작은 이미지', 'smallImage', 'smallText'),
        h('div', { class: 'hint' }, '이모지를 넣으면 자동으로 이미지가 됩니다 (Twemoji). ', api.kind === 'web' ? '📤로 업로드하면 서버가 이미지를 호스팅합니다.' : 'GIF/PNG 링크도 사용할 수 있어요.'))),
    h('div', { class: 'card' },
      h('h3', null, '🔗 Buttons', h('span', { class: 'right small muted' }, '최대 2개 · 다른 사람에게만 보여요')),
      h('div', { class: 'stack' },
        [0, 1].map((i) => h('div', { class: 'grid2' },
          textField(`버튼 ${i + 1} 이름`, `buttons.${i}.label`, { max: 32, placeholder: i ? '📺 YouTube' : '🌐 Website' }),
          h('div', { class: 'field' }, h('label', null, `버튼 ${i + 1} 링크`), h('input', { class: 'input', value: d.buttons[i]?.url || '', placeholder: 'https://', oninput: (e) => { setPath(S.draft, `buttons.${i}.url`, e.target.value.trim()); draftChanged(); } })))))),
    h('div', { class: 'card' },
      h('h3', null, '⏱️ 시간 · 파티 · 표시'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' },
          selectField('타임스탬프', 'timestamps.mode', [['none', '표시 안 함'], ['session', '이 상태 시작부터 경과'], ['app', '앱 시작부터 경과'], ['countdown', '카운트다운 (남은 시간)'], ['clock', '현재 시각처럼 보이기'], ['custom', '특정 시각부터']], { onChange: () => renderPage() }),
          d.timestamps.mode === 'countdown'
            ? h('div', { class: 'field' }, h('label', null, '카운트다운 (분)'), h('input', { class: 'input', type: 'number', min: 1, value: d.timestamps.minutes, oninput: (e) => { d.timestamps.minutes = Number(e.target.value); draftChanged(); } }))
            : d.timestamps.mode === 'custom'
              ? h('div', { class: 'field' }, h('label', null, '시작 시각'), h('input', { class: 'input', type: 'datetime-local', value: d.timestamps.start, oninput: (e) => { d.timestamps.start = e.target.value; draftChanged(); } }))
              : selectField('멤버 목록에 표시', 'statusDisplay', [['name', 'NAME (Playing Coding Mode)'], ['details', 'DETAILS'], ['state', 'STATE']])),
        d.timestamps.mode === 'countdown' || d.timestamps.mode === 'custom' ? selectField('멤버 목록에 표시', 'statusDisplay', [['name', 'NAME'], ['details', 'DETAILS'], ['state', 'STATE']]) : null,
        h('div', { class: 'row' },
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: d.party.enabled, onchange: (e) => { d.party.enabled = e.target.checked; renderPage(); } }), h('span')),
          h('span', null, '파티 인원 표시 (STATE 옆에 "(1 of 4)")'),
          d.party.enabled ? [h('input', { class: 'input', type: 'number', min: 1, style: { width: '70px' }, value: d.party.size, oninput: (e) => { d.party.size = Number(e.target.value); draftChanged(); } }), '/', h('input', { class: 'input', type: 'number', min: 1, style: { width: '70px' }, value: d.party.max, oninput: (e) => { d.party.max = Number(e.target.value); draftChanged(); } })] : null))),
    gw ? h('div', { class: 'card' },
      h('h3', null, '💬 게이트웨이 전용'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' },
          selectField('온라인 상태', 'userStatus', [['online', '🟢 온라인'], ['idle', '🌙 자리 비움'], ['dnd', '⛔ 방해 금지'], ['invisible', '⚫ 오프라인 표시']]),
          textField('커스텀 상태 이모지', 'customStatus.emoji', { max: 8, placeholder: '⚡' })),
        s.transport === 'gateway-user' ? textField('커스텀 상태 텍스트', 'customStatus.text', { max: 128, placeholder: 'coding mode' }) : h('div', { class: 'hint' }, '봇 모드에서는 NAME과 STATE만 표시됩니다.'))) : null,
  );

  previewBox = h('div');
  memberBox = h('div');
  liveBox = h('div', { class: 'card' });
  const right = h('div', { class: 'sticky' },
    h('div', { class: 'card', style: { padding: '12px' } },
      h('h3', null, '👀 Discord 미리보기'),
      previewBox,
      h('div', { style: { marginTop: '10px' } }, memberBox)),
    h('div', { class: 'card' },
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary', onclick: () => run(() => api.call('applyPresence', S.draft), '✅ Discord에 적용했습니다') }, '✅ Discord에 적용'),
        h('div', { class: 'row nowrap' },
          h('button', { class: 'btn', style: { flex: 1 }, onclick: saveDraftDialog }, '💾 저장'),
          h('button', { class: 'btn', style: { flex: 1 }, onclick: () => startTimerDialog(S.draft) }, '⏱️ 임시 적용'),
          h('button', { class: 'btn icon', title: '공유 코드 복사', onclick: () => copy(shareCodeOf(S.draft)) }, '🔗'),
          h('button', { class: 'btn icon', title: 'Discord에 표시 중인 상태로 되돌리기', onclick: () => { S.draft = null; S.variants = []; renderPage(); } }, '↺')),
        h('label', { class: 'row small' }, h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: S.liveEdit, onchange: (e) => { S.liveEdit = e.target.checked; if (S.liveEdit) draftChanged(); } }), h('span')), '입력할 때마다 Discord에 바로 반영'))),
    liveBox,
  );
  const page = h('div', { class: 'editor' }, left, right);
  queueMicrotask(() => {
    refreshPreview();
    refreshEditorLive();
  });
  return page;
}

function shareCodeOf(p) {
  const json = JSON.stringify({ l: p.name || p.details || '공유된 상태', e: isEmojiOnly(p.largeImage) ? p.largeImage : '⭐', p });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'DSS1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function saveDraftDialog() {
  const existing = S.draftId ? S.snap.library.find((x) => x.id === S.draftId) : null;
  const label = h('input', { class: 'input', value: existing?.label || S.draft.name || S.draft.details.replace(/\p{Extended_Pictographic}/gu, '').trim().slice(0, 30) });
  const emoji = h('input', { class: 'input', value: existing?.emoji || (isEmojiOnly(S.draft.largeImage) ? S.draft.largeImage : '⭐'), style: { width: '80px' } });
  const fav = h('input', { type: 'checkbox', checked: existing?.favorite ?? true });
  const actions = [];
  if (existing) actions.push({ label: '덮어쓰기', class: 'primary', onClick: () => run(() => api.call('saveStatus', { id: existing.id, label: label.value, emoji: emoji.value, favorite: fav.checked, presence: S.draft }), '저장했습니다') });
  actions.push({ label: existing ? '새로 저장' : '저장', class: existing ? '' : 'primary', onClick: async () => {
    await run(() => api.call('saveStatus', { label: label.value, emoji: emoji.value, favorite: fav.checked, presence: S.draft }), '라이브러리에 저장했습니다');
    S.draftId = S.snap.library.at(-1)?.id || null;
  } });
  modal('💾 라이브러리에 저장', h('div', { class: 'stack' },
    h('div', { class: 'row nowrap' }, h('div', { class: 'field' }, h('label', null, '아이콘'), emoji), h('div', { class: 'field', style: { flex: 1 } }, h('label', null, '이름'), label)),
    h('label', { class: 'row' }, fav, '⭐ 즐겨찾기 (트레이 · 단축키로 빠르게 전환)')), actions);
}

function startTimerDialog(presence, statusId) {
  const minutes = h('input', { class: 'input', type: 'number', min: 1, value: 30 });
  const label = h('input', { class: 'input', placeholder: '예) 회의, 식사', value: '' });
  modal('⏱️ 임시로 적용', h('div', { class: 'stack' },
    h('div', { class: 'hint' }, '정해진 시간 동안만 이 상태를 보여주고, 끝나면 원래 상태로 자동 복귀합니다.'),
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', null, '시간 (분)'), minutes), h('div', { class: 'field' }, h('label', null, '이름'), label)),
    h('div', { class: 'row' }, [5, 15, 30, 60, 120].map((m) => h('button', { class: 'chip', onclick: () => (minutes.value = m) }, `${m}분`)))),
  [{ label: '시작', class: 'primary', onClick: () => run(() => api.call('startTimer', { minutes: Number(minutes.value), label: label.value, presence: statusId ? undefined : presence, statusId }), '⏱️ 타이머 시작') }]);
}

// ───────────────────────── themes page ─────────────────────────
function pageThemes() {
  const themes = S.meta?.themes || [];
  return h('div', null,
    h('h1', { class: 'page-title' }, '✨ 원클릭 테마'),
    h('p', { class: 'page-sub' }, '클릭 한 번으로 바로 적용됩니다. 적용 후 에디터에서 자유롭게 수정하세요.'),
    h('div', { class: 'theme-grid' }, themes.map((t) => h('button', {
      class: 'theme-card', style: { '--accent': t.accent },
      onclick: async () => {
        await run(() => api.call('applyTheme', t.id), `${t.emoji} ${t.name} 테마 적용`);
        loadDraft(S.snap.current, null);
      },
    },
    h('div', { class: 'tc-top' }, t.emoji),
    h('div', { class: 'tc-body' },
      h('div', { class: 'tc-name' }, t.name), h('div', { class: 'tc-desc' }, t.description),
      h('div', { class: 'tc-lines' }, h('div', null, h('b', null, t.presence.details)), h('div', { class: 'muted' }, t.presence.state)))))));
}

// ───────────────────────── library page ─────────────────────────
function libCard(item) {
  const p = item.presence;
  const active = S.snap.currentStatusId === item.id && S.snap.mode === 'manual';
  const i = S.snap.library.indexOf(item);
  return h('div', { class: `lib-card ${active ? 'active' : ''}` },
    h('div', { class: 'lc-head' },
      h('div', { class: 'lc-emoji' }, isEmojiOnly(item.emoji) ? item.emoji : imgEl(item.emoji) || '⭐'),
      h('div', { class: 'lc-title' }, h('div', null, item.label), h('div', { class: 'small muted' }, `${item.uses || 0}회 사용${active ? ' · 🟢 사용 중' : ''}`)),
      h('button', { class: 'btn icon', title: '즐겨찾기', onclick: () => run(() => api.call('toggleFavorite', item.id)) }, h('span', { class: item.favorite ? 'star' : 'muted' }, item.favorite ? '★' : '☆'))),
    h('div', { class: 'lc-lines' }, h('div', null, h('b', null, p.details || p.name || '—')), h('div', null, p.state || ' ')),
    h('div', { class: 'lc-actions' },
      h('button', { class: 'btn primary sm', onclick: () => run(() => api.call('applyStatus', item.id), `${item.label} 적용`) }, '▶ 적용'),
      h('button', { class: 'btn sm', onclick: () => { loadDraft(p, item.id); go('editor'); } }, '✏️ 편집'),
      h('button', { class: 'btn sm', title: '임시 적용', onclick: () => startTimerDialog(null, item.id) }, '⏱️'),
      h('button', { class: 'btn sm', title: '공유 코드', onclick: async () => copy(await api.call('shareCode', item.id)) }, '🔗'),
      h('button', { class: 'btn sm', title: '복제', onclick: () => run(() => api.call('duplicateStatus', item.id)) }, '⧉'),
      h('button', { class: 'btn sm', title: '위로', disabled: i === 0 || null, onclick: () => run(() => api.call('moveStatus', item.id, -1)) }, '↑'),
      h('button', { class: 'btn sm', title: '아래로', disabled: i === S.snap.library.length - 1 || null, onclick: () => run(() => api.call('moveStatus', item.id, 1)) }, '↓'),
      h('button', { class: 'btn sm danger', title: '삭제', onclick: () => modal('삭제할까요?', h('p', null, `"${item.label}" 상태를 삭제합니다. 이 상태를 쓰는 규칙은 비워집니다.`), [{ label: '삭제', class: 'danger', onClick: () => run(() => api.call('deleteStatus', item.id), '삭제했습니다') }]) }, '🗑')));
}

function pageLibrary() {
  const q = S.libQuery.toLowerCase();
  const lib = S.snap.library.filter((x) => !q || `${x.label} ${x.presence.details} ${x.presence.state} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q));
  const favs = lib.filter((x) => x.favorite);
  const search = h('input', { class: 'input', style: { maxWidth: '260px' }, placeholder: '🔍 검색', value: S.libQuery, oninput: (e) => { S.libQuery = e.target.value; const pos = e.target.selectionStart; renderPage(); const el = contentEl.querySelector('input'); el.focus(); el.setSelectionRange(pos, pos); } });
  return h('div', null,
    h('h1', { class: 'page-title' }, '📚 Status Library'),
    h('p', { class: 'page-sub' }, '자주 쓰는 상태를 저장하고 원클릭으로 전환하세요. ⭐ 즐겨찾기는 트레이 메뉴와 단축키(Ctrl+Alt+1~9)로도 바꿀 수 있어요.'),
    h('div', { class: 'row', style: { marginBottom: '16px' } },
      search,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: () => { ensureDraft(); saveDraftDialog(); } }, '＋ 현재 에디터 내용 저장'),
      h('button', { class: 'btn', onclick: () => {
        const input = h('input', { class: 'input', placeholder: 'DSS1.xxxxx' });
        modal('🔗 공유 코드로 가져오기', h('div', { class: 'stack' }, h('div', { class: 'hint' }, '친구가 공유한 DSS1. 코드를 붙여넣으세요.'), input), [{ label: '가져오기', class: 'primary', onClick: () => run(() => api.call('importShareCode', input.value), '라이브러리에 추가했습니다') }]);
      } }, '🔗 코드 가져오기'),
      h('button', { class: 'btn', onclick: exportJson }, '⬇ 내보내기'),
      importButton()),
    favs.length ? [h('h3', { class: 'muted small', style: { margin: '6px 0 10px' } }, '⭐ FAVORITES'), h('div', { class: 'lib-grid' }, favs.map(libCard)), h('h3', { class: 'muted small', style: { margin: '22px 0 10px' } }, '📁 ALL')] : null,
    lib.length ? h('div', { class: 'lib-grid' }, lib.map(libCard)) : h('div', { class: 'card muted' }, S.snap.library.length ? '검색 결과가 없습니다.' : '아직 저장된 상태가 없습니다. 에디터에서 만들고 💾 저장을 눌러보세요.'));
}

async function exportJson() {
  const data = await run(() => api.call('exportData'));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `discord-status-studio-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
}

function importButton() {
  return h('label', { class: 'btn' }, '⬆ 가져오기', h('input', {
    type: 'file', accept: 'application/json,.json', class: 'hidden',
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const text = await f.text();
      await run(() => api.call('importData', text, { merge: true }), '가져오기 완료 (기존 데이터와 병합)');
    },
  }));
}

// ───────────────────────── automation page ─────────────────────────
let autoLiveBox;
function refreshAutoLive() {
  if (!autoLiveBox) return;
  const a = S.snap.agent;
  autoLiveBox.replaceChildren(
    h('div', { class: 'row small' }, h('span', { class: 'muted' }, '지금 표시 중:'), h('b', null, S.snap.live?.label || '—')),
    a ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, `🛰️ 원격 에이전트 ${a.host || ''} · 프로그램 ${a.count}개 · ${Math.round((Date.now() - a.at) / 1000)}초 전 보고`) : null);
  contentEl.querySelectorAll('.rule').forEach((el) => el.classList.toggle('rule-live', S.snap.live?.key === `rule:${el.dataset.id}`));
}

function statusOptions(selected) {
  return [h('option', { value: '' }, '— 상태 선택 —'), ...S.snap.library.map((x) => h('option', { value: x.id, selected: x.id === selected ? true : null }, `${isEmojiOnly(x.emoji) ? x.emoji : '⭐'} ${x.label}`))];
}

function ruleRow(r, i) {
  const rules = S.rulesDraft;
  const dirty = () => { S.rulesDirty = true; renderPage(); };
  const field = (key, props = {}) => h('input', { class: 'input', value: r[key] ?? '', ...props, oninput: (e) => { r[key] = e.target.value; S.rulesDirty = true; saveBtnState(); } });
  let cond;
  if (r.type === 'process') {
    cond = [field('match', { placeholder: 'Code.exe, chrome, title:Minecraft*', title: '쉼표로 여러 개 · * 와일드카드 · title:창제목' })];
  } else if (r.type === 'schedule') {
    cond = [field('from', { type: 'time', style: { maxWidth: '120px' } }), '~', field('to', { type: 'time', style: { maxWidth: '120px' } }),
      h('div', { class: 'days' }, '일월화수목금토'.split('').map((d, di) => h('button', { class: (r.days?.length ? r.days.includes(di) : true) ? 'on' : '', onclick: () => {
        let days = r.days?.length ? [...r.days] : [0, 1, 2, 3, 4, 5, 6];
        days = days.includes(di) ? days.filter((x) => x !== di) : [...days, di].sort();
        r.days = days.length === 7 ? [] : days;
        dirty();
      } }, d)))];
  } else {
    cond = [field('minutes', { type: 'number', min: 1, style: { maxWidth: '90px' } }), h('span', { class: 'small muted' }, '분 동안 키보드/마우스 입력 없음')];
  }
  return h('div', { class: `rule ${r.enabled === false ? 'off' : ''}`, 'data-id': r.id },
    h('label', { class: 'switch', title: '사용' }, h('input', { type: 'checkbox', checked: r.enabled !== false, onchange: (e) => { r.enabled = e.target.checked; dirty(); } }), h('span')),
    h('select', { class: 'input', onchange: (e) => { r.type = e.target.value; dirty(); } }, [['process', '🖥️ 프로그램'], ['schedule', '🕒 시간'], ['idle', '💤 자리비움']].map(([v, l]) => h('option', { value: v, selected: r.type === v ? true : null }, l))),
    h('div', { class: 'rule-cond' }, cond),
    h('select', { class: 'input rule-status', onchange: (e) => { r.statusId = e.target.value; S.rulesDirty = true; saveBtnState(); } }, statusOptions(r.statusId)),
    h('div', { class: 'row nowrap' },
      h('button', { class: 'btn icon sm', disabled: i === 0 || null, onclick: () => { [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]]; dirty(); } }, '↑'),
      h('button', { class: 'btn icon sm', disabled: i === rules.length - 1 || null, onclick: () => { [rules[i + 1], rules[i]] = [rules[i], rules[i + 1]]; dirty(); } }, '↓'),
      h('button', { class: 'btn icon sm danger', onclick: () => { rules.splice(i, 1); dirty(); } }, '✕')));
}

let rulesSaveBtn;
function saveBtnState() {
  if (rulesSaveBtn) {
    rulesSaveBtn.disabled = !S.rulesDirty;
    rulesSaveBtn.textContent = S.rulesDirty ? '💾 규칙 저장' : '저장됨';
  }
}

function pageAuto() {
  if (!S.rulesDraft) {
    S.rulesDraft = clone(S.snap.rules);
    S.rulesDirty = false;
  }
  if (!S.rotationDraft) S.rotationDraft = clone(S.snap.rotation);
  const rules = S.rulesDraft;
  const addRule = (type, extra = {}) => {
    rules.push({ id: crypto.randomUUID(), enabled: true, type, match: '', from: '09:00', to: '18:00', days: [], minutes: 10, statusId: '', ...extra });
    S.rulesDirty = true;
    renderPage();
  };
  rulesSaveBtn = h('button', { class: 'btn primary', onclick: async () => {
    const missing = rules.filter((r) => r.enabled !== false && !r.statusId);
    if (missing.length) toast(`상태가 선택되지 않은 규칙 ${missing.length}개는 무시됩니다`);
    await run(() => api.call('setRules', rules), '규칙을 저장했습니다');
    S.rulesDraft = null;
    renderPage();
  } });
  saveBtnState();
  autoLiveBox = h('div', { class: 'card' });
  queueMicrotask(refreshAutoLive);

  const server = S.snap.platform === 'server';
  const rot = S.rotationDraft;
  return h('div', { class: 'stack' },
    h('div', null, h('h1', { class: 'page-title' }, '🤖 상태 자동 변경'), h('p', { class: 'page-sub' }, '실행 중인 프로그램, 시간대, 자리비움에 따라 상태를 자동으로 바꿉니다. 위에 있는 규칙이 우선합니다.')),
    h('div', { class: 'card' },
      h('h3', null, '모드'),
      h('div', { class: 'seg' }, [['manual', '✋ 수동 — 내가 고른 상태 유지'], ['auto', '🤖 자동 — 규칙에 따라 변경'], ['rotation', '🔁 순환 — 여러 상태를 번갈아']].map(([m, l]) => h('button', { class: S.snap.mode === m ? 'on' : '', onclick: () => run(() => api.call('setMode', m)) }, l))),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, '자동 모드에서 맞는 규칙이 없으면 수동으로 설정한 상태가 표시됩니다.')),
    autoLiveBox,
    h('div', { class: 'card' },
      h('h3', null, '📋 규칙', h('span', { class: 'right row' }, rulesSaveBtn)),
      rules.length ? rules.map(ruleRow) : h('div', { class: 'muted' }, '규칙이 없습니다. 아래에서 추가하세요.'),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn sm', onclick: () => addRule('process') }, '＋ 프로그램 실행 시'),
        h('button', { class: 'btn sm', onclick: () => addRule('schedule') }, '＋ 시간대'),
        h('button', { class: 'btn sm', onclick: () => addRule('idle') }, '＋ 자리비움'),
        h('button', { class: 'btn sm ghost', onclick: () => {
          const lib = S.snap.library;
          const find = (w) => lib.find((x) => x.label.toLowerCase().includes(w))?.id || '';
          rules.push(
            { id: crypto.randomUUID(), enabled: true, type: 'schedule', from: '09:00', to: '16:00', days: [1, 2, 3, 4, 5], statusId: find('study') },
            { id: crypto.randomUUID(), enabled: true, type: 'schedule', from: '16:00', to: '22:00', days: [], statusId: find('cod') },
            { id: crypto.randomUUID(), enabled: true, type: 'schedule', from: '22:00', to: '02:00', days: [], statusId: find('late') });
          S.rulesDirty = true;
          renderPage();
          toast('시간표 예시를 추가했습니다. 각 규칙의 상태를 골라주세요.');
        } }, '📅 시간표 예시 추가')),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, '프로그램: ', h('code', null, 'Code.exe'), ' · 여러 개는 쉼표 · ', h('code', null, 'Ableton*'), ' 와일드카드 · ', h('code', null, 'title:Minecraft*'), ' 창 제목으로 감지 (Windows)', server ? ' · 서버에서는 서버 프로세스 + Windows 앱의 원격 에이전트가 보낸 목록을 사용합니다.' : '')),
    h('div', { class: 'card' },
      h('h3', null, '⚡ 빠른 추가', h('span', { class: 'right small muted' }, '클릭하면 상태 + 규칙이 함께 만들어져요')),
      h('div', { class: 'app-grid' }, (S.meta?.knownApps || []).map((a) => h('button', { class: 'btn sm ghost', style: { justifyContent: 'flex-start' }, onclick: async () => { await run(() => api.call('addRuleFromApp', a.id), `${a.label} 규칙 추가`); S.rulesDraft = null; renderPage(); } }, `${a.theme.emoji} ${a.label}`)))),
    h('div', { class: 'card' },
      h('h3', null, '🖥️ 실행 중인 프로그램', h('span', { class: 'right' }, h('button', { class: 'btn sm', onclick: async () => { S.procs = await run(() => api.call('getProcesses')); renderPage(); } }, S.procs ? '새로고침' : '불러오기'))),
      S.procs ? h('div', { class: 'proc-list' }, S.procs.slice(0, 300).map((p) => h('div', null, h('b', null, p.name), h('span', { class: 't' }, p.title), h('button', { class: 'btn sm', onclick: () => addRule('process', { match: p.name }) }, '＋ 규칙')))) : h('div', { class: 'muted small' }, '지금 실행 중인 프로그램 목록을 보고 바로 규칙을 만들 수 있어요.')),
    h('div', { class: 'card' },
      h('h3', null, '🔁 자동 순환', h('span', { class: 'right' }, h('button', { class: 'btn sm primary', onclick: async () => { await run(() => api.call('setRotation', rot), '순환 설정 저장'); S.rotationDraft = null; } }, '💾 저장'))),
      h('div', { class: 'row', style: { marginBottom: '10px' } }, '전환 간격', h('input', { class: 'input', type: 'number', min: 30, style: { width: '110px' }, value: rot.intervalSec, oninput: (e) => (rot.intervalSec = Number(e.target.value)) }), '초',
        [60, 300, 900, 3600].map((sec) => h('button', { class: 'chip', onclick: () => { rot.intervalSec = sec; renderPage(); } }, sec < 3600 ? `${sec / 60}분` : '1시간'))),
      S.snap.library.length
        ? h('div', { class: 'row' }, S.snap.library.map((x) => h('button', { class: `chip ${rot.statusIds.includes(x.id) ? 'on' : ''}`, onclick: () => { rot.statusIds = rot.statusIds.includes(x.id) ? rot.statusIds.filter((i) => i !== x.id) : [...rot.statusIds, x.id]; renderPage(); } }, `${rot.statusIds.includes(x.id) ? `${rot.statusIds.indexOf(x.id) + 1}. ` : ''}${x.label}`)))
        : h('div', { class: 'muted small' }, '라이브러리에 상태를 먼저 저장하세요.'),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, '선택한 순서대로 번갈아 표시됩니다. 상단의 🔁 순환 모드를 켜야 동작합니다.')));
}

// ───────────────────────── timer page ─────────────────────────
const TIMER_PRESETS = [
  { e: '🍅', l: 'Focus 25분', m: 25, p: { details: '🍅 Focus session', state: 'Do not disturb', largeImage: '🍅', largeText: 'Pomodoro', userStatus: 'dnd', customStatus: { emoji: '🍅', text: 'focus mode' } } },
  { e: '📚', l: '공부 50분', m: 50, p: { details: '📚 Deep study', state: 'Back after this session', largeImage: '📚', largeText: 'Study', userStatus: 'dnd', customStatus: { emoji: '📚', text: 'studying' } } },
  { e: '☕', l: '휴식 5분', m: 5, p: { details: '☕ Quick break', state: 'Back in a few', largeImage: '☕', largeText: 'Break', userStatus: 'idle', customStatus: { emoji: '☕', text: 'on a break' } } },
  { e: '🚶', l: 'BRB 15분', m: 15, p: { details: '🚶 Be right back', state: 'Stepped out', largeImage: '🚶', largeText: 'BRB', userStatus: 'idle', customStatus: { emoji: '🚶', text: 'brb' } } },
  { e: '🍜', l: '식사 30분', m: 30, p: { details: '🍜 Eating', state: 'Food first', largeImage: '🍜', largeText: 'Meal', userStatus: 'idle', customStatus: { emoji: '🍜', text: 'eating' } } },
  { e: '📹', l: '회의 60분', m: 60, p: { details: '📹 In a meeting', state: 'Reply after', largeImage: '📹', largeText: 'Meeting', userStatus: 'dnd', customStatus: { emoji: '📹', text: 'in a meeting' } } },
  { e: '🎮', l: '한 판만 40분', m: 40, p: { details: '🎮 Just one game', state: 'Definitely just one', largeImage: '🎮', largeText: 'One more game', customStatus: { emoji: '🎮', text: 'one more game' } } },
  { e: '😴', l: '낮잠 20분', m: 20, p: { details: '😴 Power nap', state: 'Recharging', largeImage: '😴', largeText: 'Nap', userStatus: 'idle', customStatus: { emoji: '😴', text: 'napping' } } },
];

function pageTimer() {
  const o = S.snap.override;
  const active = o && o.until > Date.now();
  return h('div', { class: 'stack' },
    h('div', null, h('h1', { class: 'page-title' }, '⏱️ 타이머 & 임시 상태'), h('p', { class: 'page-sub' }, '정해진 시간 동안만 상태를 바꾸고 끝나면 자동으로 원래 상태로 돌아갑니다. Discord에는 남은 시간이 표시돼요.')),
    active ? h('div', { class: 'card', style: { textAlign: 'center' } },
      h('div', { class: 'muted' }, `진행 중 · ${o.label}`),
      h('div', { class: 'timer-big', 'data-countdown': o.until }, fmtClock(o.until - Date.now())),
      h('div', { class: 'small muted' }, `${[o.presence.details, o.presence.state].filter(Boolean).join(' · ')} · ${timeOf(o.until)} 종료`),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn', onclick: () => run(() => api.call('startTimer', { minutes: Math.ceil((o.until - Date.now()) / 60000) + 5, label: o.label, presence: o.presence }), '+5분') }, '+5분'),
        h('button', { class: 'btn danger', onclick: () => run(() => api.call('cancelTimer'), '타이머 취소') }, '■ 종료'))) : null,
    h('div', { class: 'quick-grid' }, TIMER_PRESETS.map((t) => h('button', { class: 'quick', onclick: () => run(() => api.call('startTimer', { minutes: t.m, label: t.l, presence: { ...t.p, name: t.l.replace(/\s*\d+분$/, ''), timestamps: { mode: 'countdown', minutes: t.m }, appProfile: S.snap.current?.appProfile || '' } }), `${t.e} ${t.l} 시작`) },
      h('div', { class: 'q-e' }, t.e), h('b', null, t.l), h('span', null, t.p.details)))),
    h('div', { class: 'card' },
      h('h3', null, '🎛️ 직접 설정'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => startTimerDialog(S.snap.current) }, '현재 상태로 타이머'),
        S.snap.library.length ? h('select', { class: 'input', style: { maxWidth: '260px' }, onchange: (e) => e.target.value && startTimerDialog(null, e.target.value) }, statusOptions('')) : null)));
}

// ───────────────────────── stats page ─────────────────────────
function pageStats() {
  const st = S.snap.stats || { seconds: {} };
  const entries = Object.entries(st.seconds || {}).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return h('div', { class: 'stack' },
    h('div', null, h('h1', { class: 'page-title' }, '📊 통계 & 기록'), h('p', { class: 'page-sub' }, '오늘 어떤 상태로 얼마나 있었는지 보여줍니다.')),
    h('div', { class: 'stat-tiles' },
      h('div', { class: 'tile' }, h('b', null, fmtDur(total)), h('span', null, '오늘 상태 표시 시간')),
      h('div', { class: 'tile' }, h('b', null, st.changes || 0), h('span', null, '오늘 상태 변경')),
      h('div', { class: 'tile' }, h('b', null, entries[0]?.[0] || '—'), h('span', null, '가장 오래 쓴 상태')),
      h('div', { class: 'tile' }, h('b', null, S.snap.library.length), h('span', null, '저장된 상태')),
      h('div', { class: 'tile' }, h('b', null, S.snap.rules.filter((r) => r.enabled !== false).length), h('span', null, '활성 규칙'))),
    h('div', { class: 'card' },
      h('h3', null, '⏳ 오늘 상태별 시간', h('span', { class: 'right' }, h('button', { class: 'btn sm ghost', onclick: () => run(() => api.call('resetStats'), '초기화했습니다') }, '초기화'))),
      entries.length ? h('div', { class: 'bars' }, entries.slice(0, 12).map(([k, v]) => h('div', { class: 'bar' }, h('span', { class: 'lbl', title: k }, k), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${Math.max(2, (v / max) * 100)}%` } })), h('span', { class: 'val' }, fmtDur(v))))) : h('div', { class: 'muted' }, '아직 기록이 없습니다.')),
    h('div', { class: 'card' },
      h('h3', null, '🕘 변경 기록', h('span', { class: 'right' }, h('button', { class: 'btn sm ghost', onclick: () => run(() => api.call('clearHistory'), '기록을 지웠습니다') }, '지우기'))),
      S.snap.history.length ? h('div', { class: 'hist' }, S.snap.history.map((x) => h('div', null, h('span', { class: 'muted' }, timeOf(x.at)), h('span', null, x.label), h('span', { class: 'muted' }, x.summary)))) : h('div', { class: 'muted' }, '기록이 없습니다.')));
}

// ───────────────────────── settings page ─────────────────────────
function pageSettings() {
  if (!S.settingsDraft) S.settingsDraft = clone(S.snap.settings);
  const s = S.settingsDraft;
  const desktop = api.kind === 'desktop';
  const web = api.kind === 'web';
  const inp = (key, props = {}) => h('input', { class: 'input', value: s[key] ?? '', ...props, oninput: (e) => (s[key] = props.type === 'number' ? Number(e.target.value) : e.target.value) });
  const secret = (key, placeholder) => h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: s[`has_${key}`] ? '•••••••• (저장됨 — 바꾸려면 새로 입력)' : placeholder, value: s[key] === '__keep__' ? '' : s[key], oninput: (e) => (s[key] = e.target.value || (s[`has_${key}`] ? '__keep__' : '')) });
  const toggle = (key, label, hint) => h('label', { class: 'row nowrap', style: { alignItems: 'flex-start' } }, h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => (s[key] = e.target.checked) }), h('span')), h('div', null, h('div', null, label), hint ? h('div', { class: 'hint' }, hint) : null));
  const field = (label, el, hint) => h('div', { class: 'field' }, h('label', null, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
  const save = () => run(async () => {
    const r = await api.call('setSettings', s);
    S.settingsDraft = null;
    renderPage();
    return r;
  }, '설정을 저장했습니다');

  const transports = [
    ['rpc', '🖥️ 로컬 Discord 앱', 'PC의 Discord 앱으로 Rich Presence 표시 (공식 방식, 권장). Discord 앱이 같은 컴퓨터에서 실행 중이어야 합니다.'],
    ['gateway-bot', '🤖 봇 계정', '봇 토큰으로 봇의 상태를 표시. Discord 앱 없이 서버에서 24시간 가능. 내 프로필이 아닌 봇 프로필에 표시됩니다.'],
    ['gateway-user', '👤 사용자 토큰', '내 계정 토큰으로 게이트웨이에 직접 접속해 PC를 꺼도 상태를 유지합니다.'],
    ['none', '⛔ 끄기', 'Discord로 보내지 않음 (원격 에이전트 전용 / 테스트)'],
  ];

  const profiles = s.appProfiles || (s.appProfiles = []);
  return h('div', { class: 'stack', style: { maxWidth: '860px' } },
    h('div', { class: 'row' }, h('div', null, h('h1', { class: 'page-title' }, '⚙️ 설정'), h('p', { class: 'page-sub' }, '변경 후 아래 저장 버튼을 누르세요.')), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: save }, '💾 저장')),

    h('div', { class: 'card' },
      h('h3', null, '🔌 Discord 연결'),
      h('div', { class: 'stack' },
        h('div', { class: 'seg' }, transports.map(([v, l]) => h('button', { class: s.transport === v ? 'on' : '', onclick: () => { s.transport = v; renderPage(); } }, l))),
        h('div', { class: 'hint' }, transports.find((t) => t[0] === s.transport)?.[2]),
        s.transport === 'gateway-user' ? h('div', { class: 'warn-box' }, '⚠️ ', h('b', null, '주의: '), '사용자 토큰 자동화(셀프봇)는 Discord 이용약관 위반이며 계정이 정지될 수 있습니다. 본인 책임 하에 사용하세요. 토큰은 비밀번호와 같으니 절대 공유하지 마세요.') : null,
        s.transport === 'rpc' ? [
          field('Application ID (Client ID)', inp('clientId', { placeholder: '123456789012345678', inputmode: 'numeric' })),
          h('div', { class: 'info-box' }, h('b', null, '📘 Application ID 만드는 법'), h('ol', { class: 'steps' },
            h('li', null, h('a', { href: 'https://discord.com/developers/applications', target: '_blank', rel: 'noreferrer' }, 'Discord Developer Portal'), ' → New Application'),
            h('li', null, '앱 이름 = 프로필에 "Playing ○○"로 표시될 이름 (예: Coding Mode)'),
            h('li', null, 'General Information의 APPLICATION ID를 복사해서 위에 붙여넣기'),
            h('li', null, '(선택) Rich Presence → Art Assets에 이미지 업로드 후 에셋 키로 사용'))),
          h('div', { class: 'field' },
            h('label', null, '앱 프로필 (NAME 여러 개 쓰기)'),
            h('div', { class: 'hint' }, 'Discord RPC에서 "Playing ○○"의 ○○은 앱 이름으로 고정됩니다. 이름별로 앱을 만들어 등록하면 에디터에서 골라 쓸 수 있어요.'),
            profiles.map((a, i) => h('div', { class: 'row nowrap' },
              h('input', { class: 'input', placeholder: '표시 이름 (예: Minecraft Dev)', value: a.name, oninput: (e) => (a.name = e.target.value) }),
              h('input', { class: 'input', placeholder: 'Application ID', value: a.clientId, oninput: (e) => (a.clientId = e.target.value) }),
              h('button', { class: 'btn icon danger', onclick: () => { profiles.splice(i, 1); renderPage(); } }, '✕'))),
            h('div', null, h('button', { class: 'btn sm', onclick: () => { profiles.push({ id: crypto.randomUUID(), name: '', clientId: '' }); renderPage(); } }, '＋ 앱 프로필 추가'))),
        ] : null,
        s.transport.startsWith('gateway') ? [
          field(s.transport === 'gateway-bot' ? '봇 토큰' : '사용자 토큰', secret('discordToken', '토큰 붙여넣기'), '서버의 데이터 파일에만 저장되고 화면에 다시 표시되지 않습니다.'),
          s.transport === 'gateway-user' ? field('Application ID (선택)', inp('gatewayAppId', { placeholder: '이미지 URL을 표시하려면 필요', inputmode: 'numeric' }), '외부 이미지(이모지 포함)를 Rich Presence에 띄우려면 아무 Discord 앱 ID나 입력하세요.') : null,
        ] : null,
        h('div', null, h('button', { class: 'btn sm', onclick: async () => { await save(); await run(() => api.call('reconnect'), '다시 연결합니다'); } }, '🔄 저장 후 다시 연결')))),

    h('div', { class: 'card' },
      h('h3', null, '🪄 AI (Claude)'),
      h('div', { class: 'stack' },
        field('Anthropic API 키', secret('anthropicKey', 'sk-ant-...'), h('span', null, '없으면 오프라인 생성기가 동작합니다. ', h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noreferrer' }, '키 발급받기'), web ? ' · 서버 환경변수 ANTHROPIC_API_KEY도 지원' : '')),
        field('모델', inp('aiModel', { placeholder: S.meta?.defaultModel || 'claude-opus-5-5' })))),

    h('div', { class: 'card' },
      h('h3', null, '🎛️ 동작'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' },
          field('감지 주기 (초)', inp('pollSeconds', { type: 'number', min: 3 }), '프로그램/시간 규칙을 확인하는 간격'),
          field('최소 업데이트 간격 (초)', inp('minUpdateSeconds', { type: 'number', min: 4 }), 'Discord 속도 제한 보호 (최소 4초)')),
        toggle('notifyOnChange', '자동으로 상태가 바뀌면 알림 표시'),
        field('화면 테마', h('div', { class: 'seg' }, [['dark', '🌙 다크'], ['light', '☀️ 라이트'], ['system', '💻 시스템']].map(([v, l]) => h('button', { class: s.uiTheme === v ? 'on' : '', onclick: () => { s.uiTheme = v; renderPage(); } }, l)))))),

    desktop ? h('div', { class: 'card' },
      h('h3', null, '🪟 Windows'),
      h('div', { class: 'stack' },
        toggle('autoStart', 'PC 시작 시 자동 실행'),
        toggle('startHidden', '트레이로 조용히 시작', '창을 띄우지 않고 트레이에서 바로 실행'),
        toggle('hotkeys', '전역 단축키 사용', 'Ctrl+Alt+→/← 즐겨찾기 전환 · Ctrl+Alt+1~9 즐겨찾기 적용 · Ctrl+Alt+P 일시정지 · Ctrl+Alt+S 창 열기'))) : null,

    desktop ? h('div', { class: 'card' },
      h('h3', null, '🛰️ 원격 에이전트 (Linux 서버 연동)'),
      h('div', { class: 'stack' },
        h('div', { class: 'hint' }, 'PC에서 실행 중인 프로그램 목록을 서버로 보내 서버의 자동 규칙이 PC 활동에 반응하게 합니다. PC를 끄면 서버가 기본 상태를 계속 유지해요. 이 경우 위의 Discord 연결은 "끄기"로 두는 것을 권장합니다.'),
        toggle('remoteEnabled', '서버로 활동 보고'),
        h('div', { class: 'grid2' },
          field('서버 주소', inp('remoteUrl', { placeholder: 'https://status.example.com' })),
          field('API 토큰', secret('remoteToken', '서버 설정 → API 토큰에서 발급'))))) : null,

    web ? serverCards(s, toggle, field, inp) : null,

    h('div', { class: 'card' },
      h('h3', null, '💾 데이터'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: exportJson }, '⬇ 전체 내보내기 (JSON)'), importButton()),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, 'Windows 앱 ↔ 서버 간에 라이브러리와 규칙을 옮길 때 사용하세요. 토큰/API 키는 내보내지지 않습니다.')),

    h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: save }, '💾 저장')));
}

function serverCards(s, toggle, field, inp) {
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  if (!S.tokens) api.listTokens().then((r) => { S.tokens = r.tokens; if (S.page === 'settings') renderPage(); }).catch(() => {});
  const cur = h('input', { class: 'input', type: 'password', placeholder: '현재 비밀번호' });
  const next = h('input', { class: 'input', type: 'password', placeholder: '새 비밀번호 (8자 이상)' });
  const tokName = h('input', { class: 'input', placeholder: '토큰 이름 (예: 내 PC, iPhone 단축어)' });
  return [
    h('div', { class: 'card' },
      h('h3', null, '🌍 공개 상태 페이지 & 배지'),
      h('div', { class: 'stack' },
        toggle('publicStatus', '공개 상태 API/배지 켜기', '로그인 없이 현재 상태를 읽을 수 있는 주소를 엽니다 (읽기 전용).'),
        field('서버 공개 주소', inp('publicUrl', { placeholder: base.replace(/\/$/, '') }), '업로드한 이미지 URL을 만들 때 사용합니다. Discord가 접근할 수 있는 https 주소여야 해요.'),
        s.publicStatus ? h('div', { class: 'info-box small' },
          h('div', null, '📄 JSON: ', h('code', null, `${base}api/public/status`)),
          h('div', { style: { marginTop: '4px' } }, '🏷️ 배지 (GitHub README 등): ', h('code', null, `${base}badge.svg`)),
          h('img', { src: `badge.svg?t=${Date.now()}`, style: { marginTop: '8px', maxWidth: '100%' }, alt: 'badge' })) : null)),
    h('div', { class: 'card' },
      h('h3', null, '🔑 API 토큰'),
      h('div', { class: 'stack' },
        h('div', { class: 'hint' }, 'Windows 앱 원격 에이전트, CLI, iPhone 단축어/자동화에서 사용합니다. 예: ', h('code', null, `curl -X POST ${base}api/quick -H "Authorization: Bearer TOKEN" -d '{"text":"coding"}'`)),
        S.newToken ? h('div', { class: 'warn-box' }, '새 토큰 (지금만 표시됩니다): ', h('code', null, S.newToken), ' ', h('button', { class: 'btn sm', onclick: () => copy(S.newToken) }, '복사')) : null,
        (S.tokens || []).map((t) => h('div', { class: 'row nowrap' }, h('span', { style: { flex: 1 } }, `🔑 ${t.name}`), h('span', { class: 'small muted' }, t.lastUsed ? `최근 사용 ${new Date(t.lastUsed).toLocaleString()}` : '사용 안 됨'), h('button', { class: 'btn sm danger', onclick: async () => { await run(() => api.revokeToken(t.id), '토큰 삭제'); S.tokens = null; renderPage(); } }, '삭제'))),
        h('div', { class: 'row nowrap' }, tokName, h('button', { class: 'btn', onclick: async () => { const r = await run(() => api.createToken(tokName.value || 'token')); S.newToken = r.token; S.tokens = null; renderPage(); } }, '＋ 발급')))),
    h('div', { class: 'card' },
      h('h3', null, '🔒 계정'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, cur, next),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => run(() => api.changePassword(cur.value, next.value), '비밀번호를 변경했습니다') }, '비밀번호 변경'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn danger', onclick: async () => { await api.logout(); location.reload(); } }, '로그아웃')))),
  ];
}

// ───────────────────────── login (web) ─────────────────────────
function showLogin(msg) {
  app.innerHTML = '';
  const pw = h('input', { class: 'input', type: 'password', placeholder: '비밀번호', autocomplete: 'current-password' });
  const err = h('div', { class: 'small', style: { color: 'var(--red)', minHeight: '18px' } }, msg || '');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.login(pw.value);
      boot();
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
  app.append(h('div', { class: 'login' }, h('form', { class: 'card stack', onsubmit: submit },
    h('img', { src: 'icon.svg', alt: '', style: { margin: '0 auto' } }),
    h('h1', { class: 'page-title' }, 'Discord Status Studio'),
    h('p', { class: 'muted small', style: { margin: 0 } }, '서버 대시보드에 로그인하세요'),
    pw, err, h('button', { class: 'btn primary', type: 'submit' }, '로그인'),
    h('p', { class: 'hint', style: { margin: 0 } }, '비밀번호는 서버를 처음 시작할 때 로그에 표시되며 ', h('code', null, 'discord-status passwd'), ' 로 바꿀 수 있습니다.'))));
  pw.focus();
}

// ───────────────────────── boot ─────────────────────────
async function boot() {
  try {
    const sess = await api.session();
    if (!sess.authed) return showLogin();
    const [snap, meta] = await Promise.all([api.call('getSnapshot'), api.call('getMeta')]);
    S.snap = snap;
    S.meta = meta;
    applyUiTheme();
    buildShell();
    const hash = location.hash.slice(1);
    if (NAV.some(([id]) => id === hash)) S.page = hash;
    renderPage();
    api.onSnapshot((s) => setSnap(s));
    api.onNavigate?.((page) => go(page));
  } catch (e) {
    if (e instanceof AuthError) return showLogin();
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h2', null, '연결할 수 없습니다'), h('p', { class: 'muted' }, e.message), h('button', { class: 'btn primary', onclick: boot }, '다시 시도'))));
  }
}

window.addEventListener('hashchange', () => {
  const p = location.hash.slice(1);
  if (S.snap && NAV.some(([id]) => id === p) && p !== S.page) go(p);
});

boot();
