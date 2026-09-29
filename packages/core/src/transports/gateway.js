// Discord Gateway presence transport. Lets a headless machine (VPS) keep a presence
// alive without the Discord desktop client.
//
//  mode 'bot'  : bot token — sets the *bot's* presence (fully allowed by Discord).
//  mode 'user' : user token — sets *your* presence. This is "self-botting", which
//                violates Discord's Terms of Service and can get the account
//                disabled. Opt-in only; the UI shows this warning.
import { EventEmitter } from 'node:events';

const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const API = 'https://discord.com/api/v10';
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export class GatewayTransport extends EventEmitter {
  constructor({ token, mode = 'bot', applicationId = '', log = () => {} } = {}) {
    super();
    this.kind = mode === 'user' ? 'gateway-user' : 'gateway-bot';
    this.token = token;
    this.mode = mode;
    this.applicationId = applicationId;
    this.log = log;
    this.ws = null;
    this.seq = null;
    this.heartbeat = null;
    this.ready = false;
    this.user = null;
    this.status = 'disconnected';
    this.error = '';
    this.closing = false;
    this.backoff = 2000;
    this.lastPresence = null;
    this.assetCache = new Map();
  }

  setStatus(status, error = '') {
    this.status = status;
    this.error = error;
    this.emit('status', { status, error, user: this.user });
  }

  connect() {
    if (!this.token) return Promise.reject(new Error('토큰이 설정되지 않았습니다.'));
    if (typeof WebSocket === 'undefined') return Promise.reject(new Error('이 Node.js 버전은 WebSocket을 지원하지 않습니다 (Node 22+ 필요)'));
    this.closing = false;
    this.setStatus('connecting');
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        err ? reject(err) : resolve();
      };
      const ws = new WebSocket(GATEWAY);
      this.ws = ws;
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
        } catch {
          return;
        }
        this.onPayload(msg, done);
      };
      ws.onclose = (ev) => {
        this.stopHeartbeat();
        this.ready = false;
        const fatal = FATAL_CLOSE.has(ev.code);
        const reason = fatal ? `인증 실패 또는 거부됨 (code ${ev.code})` : `연결 종료 (code ${ev.code})`;
        done(new Error(reason));
        if (this.closing) return this.setStatus('disconnected');
        this.setStatus(fatal ? 'error' : 'disconnected', reason);
        if (!fatal) this.scheduleReconnect();
      };
      ws.onerror = () => {};
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60_000);
    this.reconnectTimer = setTimeout(() => {
      this.connect()
        .then(() => this.lastPresence && this.sendPresence(this.lastPresence))
        .catch((e) => this.log('gateway reconnect failed', e.message));
    }, delay);
  }

  onPayload(msg, done) {
    if (msg.s != null) this.seq = msg.s;
    switch (msg.op) {
      case 10: // HELLO
        this.startHeartbeat(msg.d.heartbeat_interval);
        this.identify();
        break;
      case 11: // heartbeat ACK
        this.acked = true;
        break;
      case 1:
        this.send({ op: 1, d: this.seq });
        break;
      case 7: // reconnect requested
        this.ws?.close(4000);
        break;
      case 9: // invalid session
        this.setStatus('error', '세션이 거부되었습니다 (토큰 확인)');
        done(new Error('invalid session'));
        this.closing = true;
        this.ws?.close(1000);
        break;
      case 0:
        if (msg.t === 'READY') {
          this.ready = true;
          this.backoff = 2000;
          const u = msg.d.user;
          this.user = u ? { id: u.id, username: u.username, global_name: u.global_name, avatar: u.avatar } : null;
          this.setStatus('connected');
          done();
        }
        break;
    }
  }

  identify() {
    const presence = this.lastPresence || { since: null, activities: [], status: 'online', afk: false };
    const d =
      this.mode === 'user'
        ? { token: this.token, capabilities: 0, properties: { os: 'Windows', browser: 'Discord Client', device: '' }, presence, compress: false }
        : { token: this.token, intents: 0, properties: { os: process.platform, browser: 'discord-status-studio', device: 'discord-status-studio' }, presence };
    this.send({ op: 2, d });
  }

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.acked = true;
    const beat = () => {
      if (!this.acked) {
        this.log('gateway heartbeat not acked, reconnecting');
        this.ws?.close(4000);
        return;
      }
      this.acked = false;
      this.send({ op: 1, d: this.seq });
    };
    this.heartbeatStart = setTimeout(() => {
      beat();
      this.heartbeat = setInterval(beat, interval);
    }, interval * Math.random());
  }

  stopHeartbeat() {
    clearTimeout(this.heartbeatStart);
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  sendPresence(presence) {
    this.lastPresence = presence;
    if (!this.ready) return;
    this.send({ op: 3, d: presence });
  }

  /**
   * User-mode rich presence can only show external images through Discord's media
   * proxy ("mp:external/..."). Resolve https URLs via the external-assets endpoint.
   */
  async resolveExternalImages(urls) {
    if (this.mode !== 'user' || !this.applicationId) return;
    const missing = [...new Set(urls)].filter((u) => /^https?:\/\//.test(u) && !this.assetCache.has(u));
    if (!missing.length) return;
    try {
      const res = await fetch(`${API}/applications/${this.applicationId}/external-assets`, {
        method: 'POST',
        headers: { Authorization: this.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: missing }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      list.forEach((item, i) => this.assetCache.set(missing[i], `mp:${item.external_asset_path}`));
    } catch (e) {
      this.log('external asset upload failed', e.message);
    }
  }

  mapImage(v) {
    if (!v) return v;
    if (/^https?:\/\//.test(v)) return this.assetCache.get(v) || undefined;
    return v;
  }

  async close() {
    this.closing = true;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    try {
      this.ws?.close(1000);
    } catch {}
    this.ws = null;
    this.ready = false;
    this.setStatus('disconnected');
  }
}
