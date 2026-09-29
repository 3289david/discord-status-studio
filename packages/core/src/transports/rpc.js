// Minimal Discord IPC (local Rich Presence) client — no dependencies.
// Talks to the Discord desktop client over its named pipe / unix socket.
import net from 'node:net';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function socketCandidates() {
  if (process.platform === 'win32') {
    return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  }
  const { XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP } = process.env;
  const base = XDG_RUNTIME_DIR || TMPDIR || TMP || TEMP || '/tmp';
  const dirs = [base, path.join(base, 'app/com.discordapp.Discord'), path.join(base, 'snap.discord'), path.join(base, '.flatpak/dev.vencord.Vesktop/xdg-run'), '/tmp'];
  const out = [];
  for (const d of [...new Set(dirs)]) for (let i = 0; i < 10; i++) out.push(path.join(d, `discord-ipc-${i}`));
  return out;
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

function tryConnect(p) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(p);
    const fail = (err) => {
      sock.destroy();
      reject(err);
    };
    sock.once('connect', () => {
      sock.off('error', fail);
      resolve(sock);
    });
    sock.once('error', fail);
  });
}

export class RpcTransport extends EventEmitter {
  kind = 'rpc';

  constructor({ clientId, log = () => {} } = {}) {
    super();
    this.clientId = clientId;
    this.log = log;
    this.sock = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.ready = false;
    this.user = null;
    this.status = 'disconnected';
    this.error = '';
  }

  async connect() {
    if (!this.clientId) throw new Error('Discord Application ID(Client ID)가 설정되지 않았습니다.');
    this.setStatus('connecting');
    let lastErr;
    for (const p of socketCandidates()) {
      try {
        this.sock = await tryConnect(p);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!this.sock) {
      this.setStatus('disconnected', 'Discord 클라이언트를 찾을 수 없습니다 (실행 중인지 확인)');
      throw lastErr || new Error('Discord IPC socket not found');
    }
    this.sock.on('data', (chunk) => this.onData(chunk));
    this.sock.on('close', () => this.onClose());
    this.sock.on('error', (e) => this.log('rpc socket error', e.message));

    const readyPromise = new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(t);
        this.off('ready', onReady);
        this.off('handshake-error', onFail);
        this.off('close', onClosed);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onFail = (msg) => {
        cleanup();
        reject(new Error(msg));
      };
      const onClosed = () => onFail(this.error || 'Discord 연결이 닫혔습니다');
      const t = setTimeout(() => {
        onFail('Discord 핸드셰이크 시간 초과');
        this.sock?.destroy();
      }, 10_000);
      this.on('ready', onReady);
      this.on('handshake-error', onFail);
      this.on('close', onClosed);
    });
    this.sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: String(this.clientId) }));
    await readyPromise;
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const len = this.buffer.readInt32LE(4);
      if (this.buffer.length < 8 + len) return;
      const body = this.buffer.subarray(8, 8 + len).toString('utf8');
      this.buffer = this.buffer.subarray(8 + len);
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        continue;
      }
      this.onMessage(op, msg);
    }
  }

  onMessage(op, msg) {
    if (op === OP.PING) {
      this.sock?.write(encode(OP.PONG, msg));
      return;
    }
    if (op === OP.CLOSE) {
      const reason = msg?.message || 'closed by Discord';
      this.emit('handshake-error', reason);
      this.setStatus('error', reason);
      this.sock?.destroy();
      return;
    }
    if (msg.evt === 'READY') {
      this.ready = true;
      this.user = msg.data?.user || null;
      this.setStatus('connected');
      this.emit('ready');
      return;
    }
    if (msg.nonce && this.pending.has(msg.nonce)) {
      const { resolve, reject } = this.pending.get(msg.nonce);
      this.pending.delete(msg.nonce);
      if (msg.evt === 'ERROR') reject(new Error(msg.data?.message || 'RPC error'));
      else resolve(msg.data);
    }
  }

  onClose() {
    const wasReady = this.ready;
    this.ready = false;
    this.sock = null;
    this.buffer = Buffer.alloc(0);
    for (const { reject } of this.pending.values()) reject(new Error('connection closed'));
    this.pending.clear();
    if (this.status !== 'error') this.setStatus('disconnected', wasReady ? 'Discord 연결이 끊어졌습니다' : this.error);
    this.emit('close');
  }

  setStatus(status, error = '') {
    this.status = status;
    this.error = error;
    this.emit('status', { status, error, user: this.user });
  }

  request(cmd, args) {
    if (!this.ready || !this.sock) return Promise.reject(new Error('Discord에 연결되지 않았습니다'));
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(nonce, { resolve, reject });
      this.sock.write(encode(OP.FRAME, { cmd, args, nonce }));
      setTimeout(() => {
        if (this.pending.delete(nonce)) reject(new Error(`${cmd} timed out`));
      }, 10_000);
    });
  }

  setActivity(activity) {
    return this.request('SET_ACTIVITY', { pid: process.pid, activity: activity || undefined });
  }

  clearActivity() {
    return this.setActivity(null);
  }

  async close() {
    try {
      if (this.ready) await this.clearActivity().catch(() => {});
      this.sock?.write(encode(OP.CLOSE, {}));
    } finally {
      this.sock?.destroy();
      this.sock = null;
      this.ready = false;
      this.setStatus('disconnected');
    }
  }
}
