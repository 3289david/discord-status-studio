// StatusEngine: the brain shared by the Windows app and the Linux server.
// It owns the saved data, decides which status is live (manual / rules / rotation /
// timer), renders template variables and pushes the result to Discord.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { JsonStore } from './store.js';
import { normalizePresence, emptyPresence, toRpcActivity, toGatewayActivities, resolveImage, summarize, computeTimestamps } from './presence.js';
import { RpcTransport } from './transports/rpc.js';
import { GatewayTransport } from './transports/gateway.js';
import { evaluateRules, describeRule } from './rules.js';
import { baseVariables, renderPresence, presenceUsesVars } from './template.js';
import { parseWindowInfo, KNOWN_APPS } from './processes.js';
import { THEMES, getTheme } from './themes.js';
import { STYLES, generate, applyStyle, restyle } from './aesthetic.js';
import { AiDesigner, DEFAULT_MODEL } from './ai.js';
import { VARIABLES } from './template.js';

const SECRET_KEYS = ['discordToken', 'anthropicKey', 'remoteToken'];
const KEEP = '__keep__';

export const DEFAULT_DATA = {
  version: 1,
  settings: {
    transport: 'rpc',
    clientId: '',
    appProfiles: [],
    discordToken: '',
    gatewayAppId: '',
    anthropicKey: '',
    aiModel: DEFAULT_MODEL,
    pollSeconds: 10,
    minUpdateSeconds: 5,
    notifyOnChange: false,
    autoStart: false,
    startHidden: false,
    hotkeys: true,
    remoteEnabled: false,
    remoteUrl: '',
    remoteToken: '',
    publicStatus: false,
    publicUrl: '',
    uiTheme: 'dark',
  },
  mode: 'manual',
  paused: false,
  current: null,
  currentStatusId: null,
  override: null,
  library: [],
  rules: [],
  rotation: { statusIds: [], intervalSec: 300, startedAt: 0 },
  history: [],
  stats: { day: '', seconds: {}, changes: 0 },
};

// Methods callable from the UI / HTTP API. Anything not listed here is private.
export const PUBLIC_METHODS = [
  'getSnapshot', 'getMeta', 'getProcesses',
  'updateCurrent', 'applyPresence', 'applyStatus', 'applyTheme', 'quick',
  'saveStatus', 'deleteStatus', 'toggleFavorite', 'moveStatus', 'duplicateStatus',
  'setMode', 'setPaused', 'clearPresence', 'nextFavorite',
  'setRules', 'addRuleFromApp', 'setRotation',
  'startTimer', 'cancelTimer',
  'setSettings', 'reconnect',
  'aiDesign', 'aesthetic', 'generateLocal', 'applyStyle',
  'exportData', 'importData', 'shareCode', 'importShareCode',
  'clearHistory', 'resetStats',
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export class StatusEngine extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.dataFile           path of the JSON data file
   * @param {object} o.platform           { name, listProcesses(opts), getIdleSeconds?(), notify?(t,b) }
   * @param {Function} [o.log]
   */
  constructor({ dataFile, platform, log = console.log }) {
    super();
    this.store = new JsonStore(dataFile, DEFAULT_DATA);
    this.platform = platform;
    this.log = log;
    this.appStart = Date.now();
    this.transport = null;
    this.transportKey = '';
    this.connection = { status: 'disconnected', error: '', user: null, kind: 'none' };
    this.procs = [];
    this.windowInfo = {};
    this.agentReport = null;
    this.live = null;
    this.lastSentJson = '';
    this.lastSentAt = 0;
    this.liveKey = '';
    this.sessionStart = Date.now();
    this.aesStep = 0;
    if (!this.data.current) this.data.current = normalizePresence(THEMES[0].presence);
    this.ai = null;
  }

  get data() {
    return this.store.data;
  }

  get settings() {
    return this.data.settings;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  async start() {
    this.ensureTransport();
    await this.tick();
    this.scheduleTick();
  }

  scheduleTick() {
    clearTimeout(this.tickTimer);
    const sec = Math.max(3, Number(this.settings.pollSeconds) || 10);
    this.tickTimer = setTimeout(async () => {
      try {
        await this.tick();
      } catch (e) {
        this.log('tick error', e);
      }
      this.scheduleTick();
    }, sec * 1000);
  }

  async stop() {
    clearTimeout(this.tickTimer);
    clearTimeout(this.pushTimer);
    clearTimeout(this.retryTimer);
    this.store.flush();
    await this.transport?.close().catch(() => {});
  }

  // ───────────────────────── transport ─────────────────────────

  clientIdFor(presence) {
    const prof = this.settings.appProfiles?.find((a) => a.id && a.id === presence?.appProfile);
    return (prof?.clientId || this.settings.clientId || '').trim();
  }

  desiredTransportKey() {
    const s = this.settings;
    if (s.transport === 'rpc') return `rpc:${this.clientIdFor(this.live?.presence || this.data.current)}`;
    if (s.transport === 'gateway-user' || s.transport === 'gateway-bot') return `${s.transport}:${s.discordToken.slice(-8)}:${s.gatewayAppId}`;
    return 'none';
  }

  ensureTransport(force = false) {
    const key = this.desiredTransportKey();
    if (!force && key === this.transportKey && this.transport) return;
    const old = this.transport;
    this.transport = null;
    this.transportKey = key;
    this.lastSentJson = '';
    old?.removeAllListeners();
    old?.close().catch(() => {});
    clearTimeout(this.retryTimer);

    const s = this.settings;
    const log = (...a) => this.log('[discord]', ...a);
    let t = null;
    if (s.transport === 'rpc') {
      const clientId = this.clientIdFor(this.live?.presence || this.data.current);
      if (!clientId) {
        this.setConnection({ status: 'error', error: '설정에서 Discord Application ID를 입력하세요', user: null, kind: 'rpc' });
        return;
      }
      t = new RpcTransport({ clientId, log });
    } else if (s.transport === 'gateway-user' || s.transport === 'gateway-bot') {
      if (!s.discordToken) {
        this.setConnection({ status: 'error', error: '설정에서 토큰을 입력하세요', user: null, kind: s.transport });
        return;
      }
      t = new GatewayTransport({ token: s.discordToken, mode: s.transport === 'gateway-user' ? 'user' : 'bot', applicationId: s.gatewayAppId, log });
    } else {
      this.setConnection({ status: 'disabled', error: '', user: null, kind: 'none' });
      return;
    }
    this.transport = t;
    t.on('status', (st) => {
      this.setConnection({ ...st, kind: t.kind });
      if (st.status === 'connected') {
        this.lastSentJson = '';
        this.push(true);
      }
    });
    t.on('close', () => {
      if (this.transport === t) this.retryConnect();
    });
    t.connect().catch((e) => {
      log('connect failed:', e.message);
      if (this.transport === t && t.kind === 'rpc') this.retryConnect();
    });
  }

  retryConnect() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      const t = this.transport;
      if (!t || t.ready) return;
      t.connect().catch(() => this.retryConnect());
    }, 15_000);
  }

  setConnection(c) {
    this.connection = c;
    this.emitSnapshot();
  }

  reconnect() {
    this.ensureTransport(true);
    return this.getSnapshot();
  }

  // ───────────────────────── resolution ─────────────────────────

  libraryItem(id) {
    return this.data.library.find((x) => x.id === id);
  }

  effectiveProcs() {
    const local = this.procs || [];
    const r = this.agentReport;
    if (r && Date.now() - r.at < 90_000) {
      const seen = new Set(local.map((p) => p.name.toLowerCase()));
      return [...local, ...r.procs.filter((p) => !seen.has(p.name.toLowerCase()))];
    }
    return local;
  }

  effectiveIdle() {
    const r = this.agentReport;
    if (r && Date.now() - r.at < 90_000 && r.idleSeconds != null) return r.idleSeconds;
    return this.platform.getIdleSeconds?.() ?? null;
  }

  needsTitles() {
    const rulesNeed = this.data.rules.some((r) => r.enabled !== false && r.type === 'process' && /title:/i.test(r.match || ''));
    const keys = ['song', 'artist', 'file', 'project'];
    const presNeed = [this.data.current, this.data.override?.presence, ...this.data.library.map((x) => x.presence)].some((p) => p && presenceUsesVars(p, keys));
    return rulesNeed || presNeed;
  }

  /** Decide which presence is live right now. */
  resolve(now = Date.now()) {
    const d = this.data;
    if (d.paused) return { presence: null, source: 'paused', label: '일시정지됨', key: 'paused' };

    if (d.override && d.override.until > now) {
      return { presence: d.override.presence, source: 'timer', label: `⏱ ${d.override.label || '타이머'}`, key: `timer:${d.override.id}`, countdownEnd: d.override.countdown ? d.override.until : null };
    }
    if (d.override && d.override.until <= now) {
      const label = d.override.label;
      d.override = null;
      this.store.save();
      this.notify('⏱ 타이머 종료', `${label || '임시 상태'}가 끝나 원래 상태로 돌아갑니다`);
    }

    if (d.mode === 'auto') {
      const hit = evaluateRules(d.rules, { now: new Date(now), procs: this.effectiveProcs(), idleSeconds: this.effectiveIdle() });
      if (hit) {
        const item = hit.rule.statusId ? this.libraryItem(hit.rule.statusId) : null;
        const presence = item?.presence || hit.rule.presence;
        if (presence) {
          return {
            presence,
            source: 'rule',
            label: `🤖 ${hit.rule.label || describeRule(hit.rule)}`,
            key: `rule:${hit.rule.id}`,
            app: hit.process?.name?.replace(/\.exe$/i, '') || '',
          };
        }
      }
    }

    if (d.mode === 'rotation') {
      const items = d.rotation.statusIds.map((id) => this.libraryItem(id)).filter(Boolean);
      if (items.length) {
        const interval = Math.max(30, Number(d.rotation.intervalSec) || 300) * 1000;
        const start = d.rotation.startedAt || now;
        const idx = Math.floor((now - start) / interval) % items.length;
        const item = items[idx];
        return { presence: item.presence, source: 'rotation', label: `🔁 순환 ${idx + 1}/${items.length} · ${item.label}`, key: `rot:${item.id}:${idx}` };
      }
    }

    const item = d.currentStatusId ? this.libraryItem(d.currentStatusId) : null;
    return { presence: d.current, source: 'manual', label: item ? `✋ ${item.label}` : '✋ 수동', key: `manual:${d.currentStatusId || 'custom'}` };
  }

  async refreshProcesses() {
    if (!this.platform.listProcesses) return;
    const hasProcRules = this.data.mode === 'auto' && this.data.rules.some((r) => r.enabled !== false && r.type === 'process');
    const titles = this.needsTitles();
    if (!hasProcRules && !titles && !this.procsRequested) return;
    this.procsRequested = false;
    try {
      this.procs = await this.platform.listProcesses({ titles });
      this.windowInfo = parseWindowInfo(this.procs);
    } catch (e) {
      this.log('process scan failed', e.message);
    }
  }

  async tick() {
    await this.refreshProcesses();
    this.accountStats();
    this.push();
    this.emit('tick');
  }

  accountStats() {
    const now = Date.now();
    const st = this.data.stats;
    if (st.day !== today()) {
      st.day = today();
      st.seconds = {};
      st.changes = 0;
    }
    if (this.live?.presence && this.lastStatAt) {
      const label = this.live.statLabel;
      st.seconds[label] = (st.seconds[label] || 0) + Math.round((now - this.lastStatAt) / 1000);
    }
    this.lastStatAt = now;
  }

  /** Recompute the live presence and send it to Discord if it changed. */
  push(force = false) {
    const now = Date.now();
    const r = this.resolve(now);
    if (r.key !== this.liveKey) {
      const prevKey = this.liveKey;
      this.liveKey = r.key;
      this.sessionStart = now;
      if (prevKey) this.recordHistory(r);
    }
    const vars = {
      ...baseVariables(new Date(now)),
      ...this.windowInfo,
      app: r.app || '',
      status_count: String(this.data.stats.changes || 0),
    };
    const presence = r.presence ? normalizePresence(renderPresence(normalizePresence(r.presence), vars)) : null;
    const statLabel = presence ? (r.source === 'manual' || r.source === 'rotation' || r.source === 'rule' ? r.label.replace(/^\S+\s/, '') : r.label) : null;
    this.live = { presence, key: r.key, source: r.source, label: r.label, since: this.sessionStart, statLabel, countdownEnd: r.countdownEnd || null };

    // RPC needs a reconnect when the chosen status uses a different Discord application.
    if (this.settings.transport === 'rpc' && this.desiredTransportKey() !== this.transportKey) this.ensureTransport();

    this.sendToDiscord(presence, r, force);
    this.emitSnapshot();
  }

  sendToDiscord(presence, r, force) {
    const t = this.transport;
    if (!t || !t.ready) return;
    const ctx = { now: Date.now(), sessionStart: this.sessionStart, appStart: this.appStart, countdownEnd: r.countdownEnd };
    let payload;
    if (t.kind === 'rpc') {
      payload = presence ? toRpcActivity(presence, ctx) : null;
    } else {
      payload = presence ? { presence, ctx } : null;
    }
    const json = JSON.stringify(payload);
    if (!force && json === this.lastSentJson) return;
    const minGap = Math.max(4, Number(this.settings.minUpdateSeconds) || 5) * 1000;
    const wait = this.lastSentAt + minGap - Date.now();
    if (wait > 0 && !force) {
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => this.push(), wait + 50);
      return;
    }
    this.lastSentJson = json;
    this.lastSentAt = Date.now();
    if (t.kind === 'rpc') {
      t.setActivity(payload).catch((e) => {
        this.log('SET_ACTIVITY failed:', e.message);
        this.lastSentJson = '';
        this.connection = { ...this.connection, error: `상태 적용 실패: ${e.message}` };
      });
    } else {
      this.sendGateway(t, presence, ctx);
    }
  }

  async sendGateway(t, presence, ctx) {
    const bot = t.kind === 'gateway-bot';
    const userStatus = presence?.userStatus || 'online';
    if (!presence) return t.sendPresence({ since: null, activities: [], status: 'online', afk: false });
    if (!bot) {
      await t.resolveExternalImages([presence.largeImage, presence.smallImage].map(resolveImage).filter(Boolean));
    }
    const activities = toGatewayActivities(presence, ctx, {
      bot,
      applicationId: t.applicationId,
      resolveImage: (v) => t.mapImage(resolveImage(v)),
    });
    t.sendPresence({ since: null, activities, status: ['online', 'idle', 'dnd', 'invisible'].includes(userStatus) ? userStatus : 'online', afk: false });
  }

  recordHistory(r) {
    const st = this.data.stats;
    st.changes = (st.changes || 0) + 1;
    const entry = { at: Date.now(), source: r.source, label: r.label, summary: summarize(r.presence) };
    this.data.history.unshift(entry);
    this.data.history.length = Math.min(this.data.history.length, 200);
    this.store.save();
    if (this.settings.notifyOnChange && r.source !== 'manual') this.notify('상태 변경', `${r.label}\n${entry.summary}`);
  }

  notify(title, body) {
    try {
      this.platform.notify?.(title, body);
    } catch {}
  }

  // ───────────────────────── snapshot / events ─────────────────────────

  emitSnapshot() {
    if (this.snapTimer) return;
    this.snapTimer = setTimeout(() => {
      this.snapTimer = null;
      this.emit('snapshot', this.getSnapshot());
    }, 60);
  }

  maskedSettings() {
    const s = { ...this.settings };
    for (const k of SECRET_KEYS) {
      s[`has_${k}`] = !!s[k];
      s[k] = s[k] ? KEEP : '';
    }
    return s;
  }

  getSnapshot() {
    const d = this.data;
    const live = this.live;
    return {
      platform: this.platform.name,
      connection: this.connection,
      mode: d.mode,
      paused: d.paused,
      live: live
        ? {
            ...live,
            timestamps: live.presence ? computeTimestamps(live.presence, { sessionStart: live.since, appStart: this.appStart, countdownEnd: live.countdownEnd }) : null,
          }
        : null,
      current: d.current,
      currentStatusId: d.currentStatusId,
      override: d.override,
      library: d.library,
      rules: d.rules,
      rotation: d.rotation,
      history: d.history.slice(0, 50),
      stats: d.stats,
      settings: this.maskedSettings(),
      ai: { enabled: !!(this.settings.anthropicKey || process.env.ANTHROPIC_API_KEY), model: this.settings.aiModel || DEFAULT_MODEL },
      agent: this.agentReport ? { at: this.agentReport.at, host: this.agentReport.host, count: this.agentReport.procs.length } : null,
      windowInfo: this.windowInfo,
      serverTime: Date.now(),
    };
  }

  getMeta() {
    return {
      themes: THEMES,
      styles: STYLES.map((s) => ({ id: s.id, label: s.label })),
      variables: VARIABLES,
      knownApps: KNOWN_APPS,
      defaultModel: DEFAULT_MODEL,
    };
  }

  async getProcesses() {
    this.procsRequested = true;
    if (this.platform.listProcesses) {
      this.procs = await this.platform.listProcesses({ titles: true });
      this.windowInfo = parseWindowInfo(this.procs);
    }
    return this.effectiveProcs()
      .map((p) => ({ name: p.name, title: p.title || '' }))
      .sort((a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0) || a.name.localeCompare(b.name));
  }

  /** Remote agent (Windows app) reports its running programs to the server. */
  agentReportIn({ procs = [], idleSeconds = null, info = {}, host = '' } = {}) {
    this.agentReport = {
      at: Date.now(),
      host: String(host).slice(0, 64),
      idleSeconds: idleSeconds == null ? null : Number(idleSeconds),
      procs: procs.slice(0, 2000).map((p) => ({ name: String(p.name || '').slice(0, 200), title: String(p.title || '').slice(0, 300) })),
    };
    this.windowInfo = { ...parseWindowInfo(this.agentReport.procs), ...info };
    this.push();
    return { ok: true };
  }

  // ───────────────────────── mutations ─────────────────────────

  commit() {
    this.store.save();
    this.push();
    return this.getSnapshot();
  }

  /** Live-edit the manual status (every keystroke in the editor). */
  updateCurrent(presence) {
    this.data.current = normalizePresence(presence);
    return this.commit();
  }

  applyPresence(presence) {
    this.data.current = normalizePresence(presence);
    this.data.currentStatusId = null;
    this.data.mode = 'manual';
    this.data.override = null;
    this.data.paused = false;
    return this.commit();
  }

  applyStatus(id) {
    const item = this.libraryItem(id);
    if (!item) throw new Error('상태를 찾을 수 없습니다');
    this.data.current = normalizePresence(item.presence);
    this.data.currentStatusId = id;
    this.data.mode = 'manual';
    this.data.override = null;
    this.data.paused = false;
    item.uses = (item.uses || 0) + 1;
    item.lastUsed = Date.now();
    return this.commit();
  }

  applyTheme(themeId) {
    const theme = getTheme(themeId);
    if (!theme) throw new Error('테마를 찾을 수 없습니다');
    const keep = this.data.current || emptyPresence();
    // Keep the user's own buttons / app profile when switching theme.
    const presence = { ...structuredClone(theme.presence), appProfile: keep.appProfile, buttons: theme.presence.buttons.length ? theme.presence.buttons : keep.buttons };
    return this.applyPresence(presence);
  }

  /** One-shot: free text → best generated status → apply. Used by CLI / API / shortcuts. */
  async quick(text) {
    const item = this.data.library.find((x) => x.label.toLowerCase() === String(text).toLowerCase());
    if (item) return this.applyStatus(item.id);
    const theme = THEMES.find((t) => t.id === String(text).toLowerCase() || t.name.toLowerCase() === String(text).toLowerCase());
    if (theme) return this.applyTheme(theme.id);
    const ai = this.getAi();
    const res = ai.enabled ? await ai.design(text, { count: 1 }) : { variants: generate(text, { count: 1 }) };
    return this.applyPresence(res.variants[0]);
  }

  saveStatus({ id, label, emoji, presence, favorite, tags } = {}) {
    const lib = this.data.library;
    const existing = id ? lib.find((x) => x.id === id) : null;
    const p = normalizePresence(presence || this.data.current);
    if (existing) {
      Object.assign(existing, {
        label: label ?? existing.label,
        emoji: emoji ?? existing.emoji,
        presence: p,
        favorite: favorite ?? existing.favorite,
        tags: tags ?? existing.tags,
        updatedAt: Date.now(),
      });
    } else {
      const item = {
        id: randomUUID(),
        label: (label || p.name || p.details || '새 상태').slice(0, 40),
        emoji: emoji || p.largeImage || '⭐',
        favorite: !!favorite,
        tags: tags || [],
        presence: p,
        createdAt: Date.now(),
        uses: 0,
      };
      lib.push(item);
      if (!presence) this.data.currentStatusId = item.id;
    }
    return this.commit();
  }

  deleteStatus(id) {
    this.data.library = this.data.library.filter((x) => x.id !== id);
    if (this.data.currentStatusId === id) this.data.currentStatusId = null;
    this.data.rotation.statusIds = this.data.rotation.statusIds.filter((x) => x !== id);
    for (const r of this.data.rules) if (r.statusId === id) r.statusId = '';
    return this.commit();
  }

  duplicateStatus(id) {
    const item = this.libraryItem(id);
    if (!item) throw new Error('상태를 찾을 수 없습니다');
    this.data.library.push({ ...structuredClone(item), id: randomUUID(), label: `${item.label} (복사)`, createdAt: Date.now(), uses: 0 });
    return this.commit();
  }

  toggleFavorite(id) {
    const item = this.libraryItem(id);
    if (item) item.favorite = !item.favorite;
    return this.commit();
  }

  moveStatus(id, dir) {
    const lib = this.data.library;
    const i = lib.findIndex((x) => x.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= lib.length) return this.getSnapshot();
    [lib[i], lib[j]] = [lib[j], lib[i]];
    return this.commit();
  }

  /** Cycle favorites (hotkeys / tray). */
  nextFavorite(dir = 1) {
    const favs = this.data.library.filter((x) => x.favorite);
    const list = favs.length ? favs : this.data.library;
    if (!list.length) return this.getSnapshot();
    const i = list.findIndex((x) => x.id === this.data.currentStatusId);
    const next = list[(i + (dir < 0 ? -1 : 1) + list.length) % list.length];
    return this.applyStatus(next.id);
  }

  setMode(mode) {
    if (!['manual', 'auto', 'rotation'].includes(mode)) throw new Error('알 수 없는 모드');
    this.data.mode = mode;
    this.data.paused = false;
    if (mode === 'rotation') this.data.rotation.startedAt = Date.now();
    this.procsRequested = true;
    const snap = this.commit();
    if (mode === 'auto') this.tick();
    return snap;
  }

  setPaused(paused) {
    this.data.paused = !!paused;
    return this.commit();
  }

  clearPresence() {
    return this.setPaused(true);
  }

  setRules(rules) {
    this.data.rules = (rules || []).map((r) => ({
      id: r.id || randomUUID(),
      enabled: r.enabled !== false,
      type: ['process', 'schedule', 'idle'].includes(r.type) ? r.type : 'process',
      label: String(r.label || ''),
      match: String(r.match || ''),
      from: String(r.from || ''),
      to: String(r.to || ''),
      days: Array.isArray(r.days) ? r.days.map(Number).filter((n) => n >= 0 && n <= 6) : [],
      minutes: Number(r.minutes) || 10,
      statusId: String(r.statusId || ''),
      presence: r.presence ? normalizePresence(r.presence) : null,
    }));
    this.procsRequested = true;
    const snap = this.commit();
    this.tick();
    return snap;
  }

  /** Quick-add: known app → library status + process rule. */
  addRuleFromApp(appId) {
    const app = KNOWN_APPS.find((a) => a.id === appId);
    if (!app) throw new Error('알 수 없는 앱');
    const presence = normalizePresence({
      name: app.label,
      type: app.theme.type ?? 0,
      details: app.theme.details,
      state: app.theme.state,
      largeImage: app.theme.emoji,
      largeText: app.label,
      smallImage: '🟢',
      smallText: 'Online',
      timestamps: { mode: 'session' },
      appProfile: this.data.current?.appProfile || '',
    });
    const item = { id: randomUUID(), label: app.label, emoji: app.theme.emoji, favorite: false, tags: ['auto'], presence, createdAt: Date.now(), uses: 0 };
    this.data.library.push(item);
    this.data.rules.push({ id: randomUUID(), enabled: true, type: 'process', label: `${app.label} 실행 중`, match: app.match, from: '', to: '', days: [], minutes: 10, statusId: item.id, presence: null });
    this.procsRequested = true;
    const snap = this.commit();
    this.tick();
    return snap;
  }

  setRotation({ statusIds, intervalSec } = {}) {
    const r = this.data.rotation;
    if (Array.isArray(statusIds)) r.statusIds = statusIds.filter((id) => this.libraryItem(id));
    if (intervalSec != null) r.intervalSec = Math.max(30, Number(intervalSec) || 300);
    r.startedAt = Date.now();
    return this.commit();
  }

  /** Temporary status (Focus timer, "BRB 15분" …). Reverts automatically. */
  startTimer({ minutes = 25, label = '', presence, statusId, countdown = true } = {}) {
    const item = statusId ? this.libraryItem(statusId) : null;
    const p = normalizePresence(presence || item?.presence || this.data.current);
    const mins = Math.min(24 * 60, Math.max(1, Number(minutes) || 25));
    this.data.override = { id: randomUUID(), label: label || item?.label || `${mins}분`, presence: p, until: Date.now() + mins * 60_000, countdown: !!countdown };
    this.data.paused = false;
    return this.commit();
  }

  cancelTimer() {
    this.data.override = null;
    return this.commit();
  }

  setSettings(partial = {}) {
    const s = this.settings;
    for (const [k, v] of Object.entries(partial)) {
      if (!(k in DEFAULT_DATA.settings)) continue;
      if (SECRET_KEYS.includes(k) && v === KEEP) continue;
      if (k === 'appProfiles') {
        s.appProfiles = (Array.isArray(v) ? v : [])
          .filter((a) => a && (a.name || a.clientId))
          .map((a) => ({ id: a.id || randomUUID(), name: String(a.name || '').slice(0, 64), clientId: String(a.clientId || '').replace(/\D/g, '') }));
        continue;
      }
      if (k === 'clientId' || k === 'gatewayAppId') {
        s[k] = String(v || '').replace(/\D/g, '');
        continue;
      }
      if (typeof DEFAULT_DATA.settings[k] === 'number') s[k] = Number(v) || DEFAULT_DATA.settings[k];
      else if (typeof DEFAULT_DATA.settings[k] === 'boolean') s[k] = !!v;
      else s[k] = typeof v === 'string' ? v.trim() : v;
    }
    this.ai = null;
    this.store.save();
    this.ensureTransport();
    this.emit('settings', this.settings);
    this.scheduleTick();
    this.push();
    return this.getSnapshot();
  }

  // ───────────────────────── generators ─────────────────────────

  getAi() {
    if (!this.ai) this.ai = new AiDesigner({ apiKey: this.settings.anthropicKey, model: this.settings.aiModel, log: (...a) => this.log('[ai]', ...a) });
    return this.ai;
  }

  async aiDesign(prompt, count = 4) {
    if (!String(prompt || '').trim()) throw new Error('설명을 입력하세요');
    return this.getAi().design(String(prompt).slice(0, 1000), { count: Math.min(6, Math.max(1, Number(count) || 4)) });
  }

  async aesthetic(presence, step, avoid = []) {
    const s = step ?? this.aesStep++;
    return this.getAi().aesthetic(normalizePresence(presence || this.data.current), { step: s, avoid: avoid.slice(-6) });
  }

  generateLocal(text, count = 4) {
    return { source: 'local', variants: generate(String(text || ''), { count }) };
  }

  applyStyle(presence, styleId) {
    return applyStyle(presence || this.data.current, styleId);
  }

  restyleLocal(presence, step) {
    return restyle(presence, step);
  }

  // ───────────────────────── import / export / share ─────────────────────────

  exportData() {
    const { library, rules, rotation, current } = this.data;
    return { app: 'discord-status-studio', version: 1, exportedAt: new Date().toISOString(), library, rules, rotation, current };
  }

  importData(json, { merge = true } = {}) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || data.app !== 'discord-status-studio') throw new Error('Discord Status Studio 백업 파일이 아닙니다');
    const lib = (data.library || []).map((x) => ({ ...x, presence: normalizePresence(x.presence) }));
    if (merge) {
      const ids = new Set(this.data.library.map((x) => x.id));
      this.data.library.push(...lib.filter((x) => !ids.has(x.id)));
      const rids = new Set(this.data.rules.map((x) => x.id));
      this.data.rules.push(...(data.rules || []).filter((x) => !rids.has(x.id)));
    } else {
      this.data.library = lib;
      this.data.rules = data.rules || [];
      if (data.rotation) this.data.rotation = data.rotation;
      if (data.current) this.data.current = normalizePresence(data.current);
    }
    return this.commit();
  }

  shareCode(id) {
    const item = id ? this.libraryItem(id) : { label: '공유된 상태', emoji: '⭐', presence: this.data.current };
    if (!item) throw new Error('상태를 찾을 수 없습니다');
    const payload = { l: item.label, e: item.emoji, p: item.presence };
    return 'DSS1.' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  importShareCode(code) {
    const m = /^DSS1\.([A-Za-z0-9_-]+)$/.exec(String(code || '').trim());
    if (!m) throw new Error('올바른 공유 코드가 아닙니다 (DSS1.으로 시작)');
    const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    return this.saveStatus({ label: payload.l, emoji: payload.e, presence: payload.p });
  }

  clearHistory() {
    this.data.history = [];
    return this.commit();
  }

  resetStats() {
    this.data.stats = { day: today(), seconds: {}, changes: 0 };
    return this.commit();
  }

  /** Dispatch a whitelisted method call coming from UI / HTTP. */
  async call(method, args = []) {
    if (!PUBLIC_METHODS.includes(method) || typeof this[method] !== 'function') throw new Error(`Unknown method: ${method}`);
    return this[method](...(Array.isArray(args) ? args : [args]));
  }
}
