// Password + session + API-token auth for the web dashboard.
// auth.json is re-read on every change so the CLI (`discord-status passwd`,
// `discord-status token create`) can edit it while the server is running.
import fs from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { files } from './paths.js';

const SESSION_TTL = 30 * 24 * 3600 * 1000;

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(String(pw), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export function readAuth() {
  try {
    return JSON.parse(fs.readFileSync(files.auth(), 'utf8'));
  } catch {
    return { passwordHash: '', tokens: [] };
  }
}

export function updateAuth(fn) {
  const d = readAuth();
  d.tokens ||= [];
  fn(d);
  const tmp = `${files.auth()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, files.auth());
  return d;
}

export function setPassword(pw) {
  if (String(pw).length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다');
  updateAuth((d) => (d.passwordHash = hashPassword(pw)));
}

/** Ensure a password exists. Returns the generated one (to print once) or null. */
export function ensurePassword() {
  const d = readAuth();
  if (d.passwordHash) return null;
  const pw = process.env.STUDIO_PASSWORD || randomBytes(9).toString('base64url');
  setPassword(pw);
  return process.env.STUDIO_PASSWORD ? null : pw;
}

export function createToken(name = 'token') {
  const token = `dss_${randomBytes(24).toString('base64url')}`;
  updateAuth((d) => d.tokens.push({ id: randomUUID(), name: String(name).slice(0, 60), hash: sha256(token), created: Date.now(), lastUsed: 0 }));
  return token;
}

export function listTokens() {
  return (readAuth().tokens || []).map(({ id, name, created, lastUsed }) => ({ id, name, created, lastUsed }));
}

export function revokeToken(id) {
  updateAuth((d) => (d.tokens = d.tokens.filter((t) => t.id !== id)));
}

/** A fresh token for the local CLI, rewritten on every server start. */
export function writeCliToken() {
  const token = `dss_cli_${randomBytes(24).toString('base64url')}`;
  fs.writeFileSync(files.cliToken(), token, { mode: 0o600 });
  return sha256(token);
}

export class Auth {
  constructor() {
    this.sessions = new Map(); // sha256(sessionId) -> { created }
    this.attempts = new Map(); // ip -> { count, first }
    this.cliHash = writeCliToken();
    this.lastUsedWrite = 0;
  }

  checkRate(ip) {
    const now = Date.now();
    const a = this.attempts.get(ip);
    if (!a || now - a.first > 15 * 60_000) {
      this.attempts.set(ip, { count: 1, first: now });
      return true;
    }
    a.count++;
    return a.count <= 10;
  }

  login(password, ip) {
    if (!this.checkRate(ip)) throw Object.assign(new Error('시도가 너무 많습니다. 15분 후 다시 시도하세요.'), { status: 429 });
    if (!verifyPassword(password, readAuth().passwordHash)) throw Object.assign(new Error('비밀번호가 올바르지 않습니다'), { status: 401 });
    this.attempts.delete(ip);
    const sid = randomBytes(32).toString('base64url');
    this.sessions.set(sha256(sid), { created: Date.now() });
    return sid;
  }

  logout(sid) {
    if (sid) this.sessions.delete(sha256(sid));
  }

  changePassword(current, next) {
    if (!verifyPassword(current, readAuth().passwordHash)) throw Object.assign(new Error('현재 비밀번호가 올바르지 않습니다'), { status: 400 });
    setPassword(next);
    this.sessions.clear();
  }

  validSession(sid) {
    if (!sid) return false;
    const s = this.sessions.get(sha256(sid));
    if (!s) return false;
    if (Date.now() - s.created > SESSION_TTL) {
      this.sessions.delete(sha256(sid));
      return false;
    }
    return true;
  }

  validToken(token) {
    if (!token) return false;
    const h = sha256(token);
    if (h === this.cliHash) return true;
    const t = (readAuth().tokens || []).find((x) => x.hash === h);
    if (!t) return false;
    if (Date.now() - this.lastUsedWrite > 60_000) {
      this.lastUsedWrite = Date.now();
      updateAuth((d) => {
        const x = d.tokens.find((y) => y.id === t.id);
        if (x) x.lastUsed = Date.now();
      });
    }
    return true;
  }
}
