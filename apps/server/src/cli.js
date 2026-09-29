#!/usr/bin/env node
// discord-status — CLI for the Discord Status Studio Linux server.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { files, dataDir } from './paths.js';
import { setPassword, createToken, listTokens, revokeToken } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const rest = argv.slice(1);

function flag(name, short) {
  const i = rest.findIndex((a) => a === `--${name}` || (short && a === `-${short}`));
  if (i < 0) return undefined;
  const v = rest[i + 1];
  return v && !v.startsWith('-') ? v : true;
}

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
};

function readPid() {
  try {
    const pid = Number(fs.readFileSync(files.pid(), 'utf8'));
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function runtime() {
  try {
    return JSON.parse(fs.readFileSync(files.runtime(), 'utf8'));
  } catch {
    return null;
  }
}

async function api(pathname, body) {
  const rt = runtime();
  if (!rt) throw new Error('서버가 실행 중이 아닙니다. `discord-status start -d` 로 시작하세요.');
  const token = fs.readFileSync(files.cliToken(), 'utf8').trim();
  const host = rt.host === '0.0.0.0' || rt.host === '::' ? '127.0.0.1' : rt.host;
  const res = await fetch(`http://${host}:${rt.port}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const call = (method, ...args) => api('/api/call', { method, args }).then((j) => j.result);

function printLive(r) {
  console.log(`${C.g('●')} ${C.b(r.live || '')}  ${C.d(r.summary || '')}`);
}

const commands = {
  async start() {
    const port = Number(flag('port', 'p') || process.env.DSS_PORT || 8787);
    const host = String(flag('host') || process.env.DSS_HOST || '0.0.0.0');
    if (flag('daemon', 'd')) {
      if (readPid()) return console.log(C.y('이미 실행 중입니다.'), `pid ${readPid()}`);
      const out = fs.openSync(files.log(), 'a');
      const child = spawn(process.execPath, [path.join(here, 'cli.js'), 'start', '--port', String(port), '--host', host], {
        detached: true,
        stdio: ['ignore', out, out],
        env: process.env,
      });
      fs.writeFileSync(files.pid(), String(child.pid));
      child.unref();
      console.log(`${C.g('✔')} 백그라운드에서 시작했습니다 (pid ${child.pid})`);
      console.log(`  대시보드: http://localhost:${port}`);
      console.log(`  로그: ${files.log()}  ${C.d('(discord-status logs)')}`);
      await new Promise((r) => setTimeout(r, 1500));
      const tail = fs.readFileSync(files.log(), 'utf8').split('\n').slice(-12).join('\n');
      if (tail.includes('비밀번호')) console.log(`\n${tail}`);
      return;
    }
    fs.writeFileSync(files.pid(), String(process.pid));
    const { startServer } = await import('./server.js');
    await startServer({ port, host });
  },

  async stop() {
    const pid = readPid();
    if (!pid) return console.log('실행 중이 아닙니다.');
    process.kill(pid, 'SIGTERM');
    fs.rmSync(files.pid(), { force: true });
    console.log(`${C.g('✔')} 중지했습니다 (pid ${pid})`);
  },

  async restart() {
    await commands.stop();
    await new Promise((r) => setTimeout(r, 1000));
    rest.push('-d');
    await commands.start();
  },

  async status() {
    const s = await api('/api/status');
    const c = s.connection;
    const dot = c.status === 'connected' ? C.g('●') : c.status === 'connecting' ? C.y('●') : C.r('●');
    console.log(`${dot} Discord: ${c.status}${c.user ? ` (${c.user.username})` : ''}${c.error ? C.d(` — ${c.error}`) : ''}`);
    console.log(`  모드: ${s.paused ? '일시정지' : s.mode}`);
    console.log(`  현재: ${C.b(s.live?.label || '-')}  ${C.d(s.summary)}`);
    if (s.override) console.log(`  타이머: ${s.override.label} (${new Date(s.override.until).toLocaleTimeString()} 종료)`);
  },

  async set() {
    const text = rest.join(' ').trim();
    if (!text) throw new Error('사용법: discord-status set "Minecraft 서버 개발 중"');
    printLive(await api('/api/quick', { text }));
  },

  async use() {
    return commands.set();
  },

  async list() {
    const s = await api('/api/status');
    if (!s.library.length) return console.log('저장된 상태가 없습니다.');
    for (const x of s.library) console.log(`${x.favorite ? C.y('★') : ' '} ${x.label}  ${C.d(x.id)}`);
  },

  async themes() {
    const meta = await call('getMeta');
    for (const t of meta.themes) console.log(`${t.emoji}  ${C.b(t.id.padEnd(12))} ${t.presence.details} · ${C.d(t.presence.state)}`);
  },

  async theme() {
    printLive(await api('/api/quick', { theme: rest[0] }));
  },

  async pause() {
    printLive(await api('/api/quick', { pause: true }));
  },

  async resume() {
    printLive(await api('/api/quick', { pause: false }));
  },

  async mode() {
    printLive(await api('/api/quick', { mode: rest[0] }));
  },

  async timer() {
    const minutes = Number(rest[0]);
    if (!minutes) throw new Error('사용법: discord-status timer 25 [이름]');
    printLive(await api('/api/quick', { timer: minutes, label: rest.slice(1).join(' ') }));
  },

  async next() {
    await call('nextFavorite', 1);
    await commands.status();
  },

  async passwd() {
    let pw = rest[0];
    if (!pw) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      pw = await rl.question('새 비밀번호 (8자 이상): ');
      rl.close();
    }
    setPassword(pw);
    console.log(`${C.g('✔')} 대시보드 비밀번호를 변경했습니다.`);
  },

  async token() {
    const sub = rest[0];
    if (sub === 'create') {
      const t = createToken(rest.slice(1).join(' ') || 'cli');
      console.log(`${C.g('✔')} 새 API 토큰 (다시 표시되지 않습니다):\n${C.b(t)}`);
    } else if (sub === 'revoke') {
      revokeToken(rest[1]);
      console.log(`${C.g('✔')} 삭제했습니다.`);
    } else {
      const list = listTokens();
      if (!list.length) console.log('토큰이 없습니다. `discord-status token create <이름>`');
      for (const t of list) console.log(`🔑 ${t.name}  ${C.d(t.id)}  ${t.lastUsed ? `최근 ${new Date(t.lastUsed).toLocaleString()}` : ''}`);
    }
  },

  async logs() {
    const file = files.log();
    if (!fs.existsSync(file)) return console.log('로그가 없습니다 (포그라운드 실행 중이거나 systemd 사용 시 journalctl -u discord-status 확인).');
    const lines = Number(flag('lines', 'n')) || 50;
    console.log(fs.readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n'));
    if (flag('follow', 'f')) {
      let size = fs.statSync(file).size;
      fs.watchFile(file, { interval: 500 }, (cur) => {
        if (cur.size > size) {
          const fd = fs.openSync(file, 'r');
          const buf = Buffer.alloc(cur.size - size);
          fs.readSync(fd, buf, 0, buf.length, size);
          fs.closeSync(fd);
          process.stdout.write(buf);
          size = cur.size;
        }
      });
    }
  },

  async 'install-service'() {
    const user = !!flag('user');
    const port = Number(flag('port', 'p') || 8787);
    const unit = `[Unit]
Description=Discord Status Studio
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${process.execPath} ${path.join(here, 'cli.js')} start --port ${port}
Restart=always
RestartSec=5
Environment=DSS_DATA_DIR=${dataDir()}
${user ? '' : `User=${os.userInfo().username}\n`}NoNewPrivileges=true

[Install]
WantedBy=${user ? 'default.target' : 'multi-user.target'}
`;
    if (user) {
      const dir = path.join(os.homedir(), '.config', 'systemd', 'user');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'discord-status.service'), unit);
      console.log(`${C.g('✔')} ${path.join(dir, 'discord-status.service')} 생성`);
      console.log('\n  systemctl --user daemon-reload\n  systemctl --user enable --now discord-status\n  loginctl enable-linger $USER   # 로그아웃 후에도 실행');
    } else {
      const out = path.join(process.cwd(), 'discord-status.service');
      fs.writeFileSync(out, unit);
      console.log(`${C.g('✔')} ${out} 생성`);
      console.log(`\n  sudo mv ${out} /etc/systemd/system/\n  sudo systemctl daemon-reload\n  sudo systemctl enable --now discord-status\n  journalctl -u discord-status -f   # 로그 (초기 비밀번호 확인)`);
    }
  },

  async url() {
    const rt = runtime();
    console.log(rt ? `http://localhost:${rt.port}` : '서버가 실행 중이 아닙니다.');
  },

  help() {
    console.log(`${C.b('Discord Status Studio — Linux 서버')}

${C.b('서버')}
  discord-status start [-d] [--port 8787] [--host 0.0.0.0]   서버 시작 (-d: 백그라운드)
  discord-status stop | restart | status | logs [-f]
  discord-status install-service [--user]                    systemd 서비스 생성
  discord-status passwd [새비밀번호]                           대시보드 비밀번호 변경
  discord-status token [create <이름> | revoke <id>]          API 토큰 관리

${C.b('상태 변경')}
  discord-status set "Minecraft 서버 개발 중"   자유 입력 → 자동 꾸미기 → 적용
  discord-status use <저장된 상태 이름>
  discord-status theme <developer|gamer|minimal|...>   (목록: discord-status themes)
  discord-status list                           저장된 상태 목록
  discord-status next                           다음 즐겨찾기
  discord-status mode <manual|auto|rotation>
  discord-status timer <분> [이름]              임시 상태 (끝나면 복귀)
  discord-status pause | resume

데이터 위치: ${dataDir()}  (DSS_DATA_DIR 로 변경)`);
  },
};

const fn = commands[cmd] || commands.help;
Promise.resolve(fn()).catch((e) => {
  console.error(C.r('✖'), e.message);
  process.exit(1);
});
