// HTTP server: web dashboard + JSON API + SSE live updates + public status/badge.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { StatusEngine, listProcesses, summarize } from '../shared/core/index.js';
import { Auth, ensurePassword, createToken, listTokens, revokeToken } from './auth.js';
import { files, dataDir } from './paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(here, '..', 'shared', 'ui');
const VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': isBuf || typeof body === 'string' ? headers['content-type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('요청이 너무 큽니다'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('잘못된 JSON'), { status: 400 });
  }
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function isHttps(req) {
  return req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
}

function sniffImage(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

function badgeSvg(label, value, color) {
  const w = (s) => Math.round(Array.from(s).reduce((a, ch) => a + (ch.codePointAt(0) > 0x2e80 ? 12 : 7), 0) + 16);
  const lw = w(label);
  const vw = Math.min(420, w(value));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="22" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient>
<clipPath id="r"><rect width="${lw + vw}" height="22" rx="5" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="22" fill="#5865f2"/><rect x="${lw}" width="${vw}" height="22" fill="${color}"/><rect width="${lw + vw}" height="22" fill="url(#s)"/></g>
<g fill="#fff" font-family="Segoe UI,Verdana,sans-serif" font-size="12"><text x="8" y="15">${escapeXml(label)}</text><text x="${lw + 8}" y="15">${escapeXml(value.length > 60 ? value.slice(0, 59) + '…' : value)}</text></g></svg>`;
}

export async function startServer({ port = 8787, host = '0.0.0.0' } = {}) {
  const generated = ensurePassword();
  const auth = new Auth();
  const engine = new StatusEngine({
    dataFile: files.data(),
    platform: {
      name: 'server',
      listProcesses,
      getIdleSeconds: () => null,
      notify: (t, b) => log('[notify]', t, '-', b.replace(/\n/g, ' ')),
    },
    log: (...a) => log(...a),
  });
  await engine.start();

  const clients = new Set();
  engine.on('snapshot', (snap) => {
    const data = `event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`;
    for (const res of clients) res.write(data);
  });
  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25_000).unref();

  function authed(req) {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (bearer) return auth.validToken(bearer.trim()) ? 'token' : false;
    return auth.validSession(parseCookies(req).dss_session) ? 'session' : false;
  }

  function publicBase(req) {
    const configured = engine.settings.publicUrl?.replace(/\/+$/, '');
    if (configured) return configured;
    return `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
  }

  async function handleApi(req, res, url) {
    const p = url.pathname;
    const method = req.method;

    // ── public endpoints ──
    if (p === '/api/session') return send(res, 200, { authed: !!authed(req) });
    if (p === '/api/login' && method === 'POST') {
      const { password } = await readJson(req);
      const sid = auth.login(password, clientIp(req));
      const cookie = `dss_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 3600}${isHttps(req) ? '; Secure' : ''}`;
      return send(res, 200, { ok: true }, { 'set-cookie': cookie });
    }
    if (p === '/api/public/status' && method === 'GET') {
      if (!engine.settings.publicStatus) return send(res, 404, { error: 'disabled' });
      const live = engine.live;
      const pr = live?.presence;
      return send(res, 200, {
        online: engine.connection.status === 'connected',
        paused: engine.data.paused,
        source: live?.source,
        presence: pr ? { name: pr.name, type: pr.type, details: pr.details, state: pr.state, largeImage: pr.largeImage, smallImage: pr.smallImage } : null,
        since: live?.since,
      }, { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
    }

    // ── authenticated ──
    const who = authed(req);
    if (!who) return send(res, 401, { error: 'unauthorized' });
    // CSRF: cookie-authenticated writes must come from our own page (custom header).
    if (who === 'session' && method !== 'GET' && req.headers['x-requested-with'] !== 'dss') return send(res, 403, { error: 'csrf' });

    if (p === '/api/logout' && method === 'POST') {
      auth.logout(parseCookies(req).dss_session);
      return send(res, 200, { ok: true }, { 'set-cookie': 'dss_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (p === '/api/call' && method === 'POST') {
      const { method: m, args } = await readJson(req);
      const result = await engine.call(m, args);
      return send(res, 200, { result });
    }
    if (p === '/api/events' && method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: snapshot\ndata: ${JSON.stringify(engine.getSnapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/status' && method === 'GET') {
      const snap = engine.getSnapshot();
      return send(res, 200, { connection: snap.connection, mode: snap.mode, paused: snap.paused, live: snap.live, summary: summarize(snap.live?.presence), override: snap.override, library: snap.library.map((x) => ({ id: x.id, label: x.label, favorite: x.favorite })) });
    }
    if (p === '/api/quick' && method === 'POST') {
      const body = await readJson(req);
      let snap;
      if (body.pause === true) snap = engine.setPaused(true);
      else if (body.pause === false || body.resume) snap = engine.setPaused(false);
      else if (body.mode) snap = engine.setMode(body.mode);
      else if (body.timer) snap = engine.startTimer({ minutes: body.timer, label: body.label, statusId: body.statusId });
      else if (body.statusId) snap = engine.applyStatus(body.statusId);
      else if (body.theme) snap = engine.applyTheme(body.theme);
      else if (body.presence) snap = engine.applyPresence(body.presence);
      else if (body.text) snap = await engine.quick(String(body.text));
      else return send(res, 400, { error: 'text, statusId, theme, presence, mode, timer, pause 중 하나가 필요합니다' });
      return send(res, 200, { ok: true, live: snap.live?.label, summary: summarize(snap.live?.presence) });
    }
    if (p === '/api/agent/report' && method === 'POST') {
      return send(res, 200, engine.agentReportIn(await readJson(req)));
    }
    if (p === '/api/upload' && method === 'POST') {
      const buf = await readBody(req, 4 * 1024 * 1024);
      const ext = sniffImage(buf);
      if (!ext) return send(res, 400, { error: 'PNG, JPG, GIF, WEBP 이미지만 업로드할 수 있습니다' });
      const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(files.media(), name), buf);
      return send(res, 200, { url: `${publicBase(req)}/media/${name}`, name });
    }
    if (p === '/api/tokens' && method === 'GET') return send(res, 200, { tokens: listTokens() });
    if (p === '/api/tokens' && method === 'POST') {
      const { name } = await readJson(req);
      return send(res, 200, { token: createToken(name || 'token') });
    }
    if (p.startsWith('/api/tokens/') && method === 'DELETE') {
      revokeToken(decodeURIComponent(p.slice('/api/tokens/'.length)));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/password' && method === 'POST') {
      const { current, next } = await readJson(req);
      auth.changePassword(current, next);
      return send(res, 200, { ok: true }, { 'set-cookie': 'dss_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (p === '/api/info') return send(res, 200, { version: VERSION, platform: process.platform, node: process.version, hostname: os.hostname() });
    return send(res, 404, { error: 'not found' });
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(UI_DIR, rel));
    if (!file.startsWith(UI_DIR + path.sep)) return send(res, 403, 'forbidden');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'not found');
      send(res, 200, buf, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    });
  }

  function serveMedia(req, res, url) {
    const name = path.basename(decodeURIComponent(url.pathname.slice('/media/'.length)));
    if (!/^[\w-]+\.(png|jpg|gif|webp)$/.test(name)) return send(res, 404, 'not found');
    fs.readFile(path.join(files.media(), name), (err, buf) => {
      if (err) return send(res, 404, 'not found');
      send(res, 200, buf, { 'content-type': MIME[path.extname(name)], 'cache-control': 'public, max-age=31536000, immutable' });
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/healthz') return send(res, 200, { ok: true, discord: engine.connection.status });
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
      if (url.pathname === '/badge.svg') {
        if (!engine.settings.publicStatus) return send(res, 404, 'disabled');
        const pr = engine.live?.presence;
        const value = engine.data.paused || !pr ? 'offline' : [pr.details, pr.state].filter(Boolean).join(' · ') || pr.name;
        const color = engine.data.paused || !pr ? '#80848e' : '#23a55a';
        return send(res, 200, badgeSvg('discord', value, color), { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-cache, max-age=0' });
      }
      return serveStatic(req, res, url);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) log('error', req.method, url.pathname, e);
      send(res, status, { error: e.message || 'error' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  fs.writeFileSync(files.runtime(), JSON.stringify({ port, host, pid: process.pid, startedAt: Date.now() }));

  log(`Discord Status Studio server v${VERSION}`);
  log(`Dashboard: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}   (data: ${dataDir()})`);
  if (generated) {
    log('──────────────────────────────────────────────');
    log(`초기 대시보드 비밀번호: ${generated}`);
    log('`discord-status passwd` 로 변경할 수 있습니다.');
    log('──────────────────────────────────────────────');
  }

  const shutdown = async (sig) => {
    log(`${sig} received, shutting down`);
    for (const res of clients) res.end();
    server.close();
    await engine.stop();
    try {
      fs.unlinkSync(files.runtime());
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return { server, engine };
}
