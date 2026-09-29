// Discord Status Studio — Windows app (Electron main process).
// Lives in the system tray, keeps the Discord Rich Presence alive in the background.
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, globalShortcut, powerMonitor, shell, protocol, net } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StatusEngine, listProcesses, summarize, THEMES } from './shared/core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(here, 'shared', 'ui');
const ASSETS = path.join(here, 'assets');

let win = null;
let tray = null;
let engine = null;
let quitting = false;
let hiddenHintShown = false;
let lastSnap = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId('com.discordstatusstudio.app');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ───────────────────────── window ─────────────────────────

function showWindow(page) {
  if (!win || win.isDestroyed()) createWindow(true);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (page) win.webContents.send('navigate', page);
}

function createWindow(show) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    show: false,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    title: 'Discord Status Studio',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('app://ui/index.html');
  win.once('ready-to-show', () => show && win.show());

  // External links open in the real browser; the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!hiddenHintShown) {
      hiddenHintShown = true;
      notify('트레이에서 계속 실행 중', 'Discord 상태는 계속 유지됩니다. 트레이 아이콘을 눌러 다시 열 수 있어요.');
    }
  });
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, icon: path.join(ASSETS, 'icon.png'), silent: true }).show();
}

// ───────────────────────── tray ─────────────────────────

const trayIcons = {};
function trayIcon(paused) {
  const key = paused ? 'paused' : 'on';
  trayIcons[key] ||= nativeImage.createFromPath(path.join(ASSETS, paused ? 'tray-paused.png' : 'tray.png'));
  return trayIcons[key];
}

const clip = (s, n = 48) => (Array.from(s || '').length > n ? Array.from(s).slice(0, n - 1).join('') + '…' : s || '');

function buildTrayMenu(snap) {
  const c = snap.connection;
  const statusLine =
    snap.paused ? '⏸ 일시정지됨'
      : c.status === 'connected' ? `🟢 실행 중${c.user ? ` · ${c.user.global_name || c.user.username}` : ''}`
        : c.status === 'connecting' ? '🟡 연결 중…'
          : `🔴 ${clip(c.error || 'Discord 연결 안 됨', 40)}`;
  const favs = snap.library.filter((x) => x.favorite);
  const others = snap.library.filter((x) => !x.favorite).slice(0, 20);
  const item = (x) => ({
    label: clip(`${/\p{Extended_Pictographic}/u.test(x.emoji) ? x.emoji : '⭐'}  ${x.label}`, 40),
    type: 'radio',
    checked: snap.currentStatusId === x.id && snap.mode === 'manual',
    click: () => engine.applyStatus(x.id),
  });
  const statusMenu = [
    ...(favs.length ? [{ label: '⭐ 즐겨찾기', enabled: false }, ...favs.map(item)] : []),
    ...(others.length ? [{ type: 'separator' }, ...others.map(item)] : []),
    ...(snap.library.length ? [{ type: 'separator' }] : [{ label: '저장된 상태 없음', enabled: false }, { type: 'separator' }]),
    { label: '✨ 테마', submenu: THEMES.map((t) => ({ label: `${t.emoji}  ${t.name}`, click: () => engine.applyTheme(t.id) })) },
  ];
  const timer = snap.override && snap.override.until > Date.now();
  return Menu.buildFromTemplate([
    { label: 'Discord Status Studio', enabled: false },
    { label: statusLine, enabled: false },
    { label: `🎨 ${clip(snap.live?.label || '-', 40)}`, enabled: false },
    { label: `     ${clip(summarize(snap.live?.presence), 44)}`, enabled: false },
    { type: 'separator' },
    snap.paused
      ? { label: '▶ 재개', click: () => engine.setPaused(false) }
      : { label: '⏸ 일시정지', click: () => engine.setPaused(true) },
    { label: '🔄 상태 변경', submenu: statusMenu },
    { label: '⏭ 다음 즐겨찾기', accelerator: snap.settings.hotkeys ? 'Ctrl+Alt+Right' : undefined, click: () => engine.nextFavorite(1) },
    {
      label: '🧭 모드',
      submenu: [
        ['manual', '✋ 수동'],
        ['auto', '🤖 자동 (규칙)'],
        ['rotation', '🔁 순환'],
      ].map(([m, l]) => ({ label: l, type: 'radio', checked: snap.mode === m, click: () => engine.setMode(m) })),
    },
    {
      label: timer ? `⏱ 타이머 · ${clip(snap.override.label, 20)}` : '⏱ 빠른 타이머',
      submenu: [
        ...[15, 30, 60].map((m) => ({ label: `현재 상태로 ${m}분`, click: () => engine.startTimer({ minutes: m, label: `${m}분` }) })),
        { type: 'separator' },
        { label: '🍅 Focus 25분', click: () => engine.startTimer({ minutes: 25, label: 'Focus', presence: { ...snap.current, details: '🍅 Focus session', state: 'Do not disturb', largeImage: '🍅', largeText: 'Pomodoro', timestamps: { mode: 'countdown', minutes: 25 } } }) },
        { label: '🚶 BRB 15분', click: () => engine.startTimer({ minutes: 15, label: 'BRB', presence: { ...snap.current, details: '🚶 Be right back', state: 'Stepped out', largeImage: '🚶', largeText: 'BRB', timestamps: { mode: 'countdown', minutes: 15 } } }) },
        ...(timer ? [{ type: 'separator' }, { label: '■ 타이머 종료', click: () => engine.cancelTimer() }] : []),
      ],
    },
    { type: 'separator' },
    { label: '🎨 열기', click: () => showWindow() },
    { label: '⚙ 설정', click: () => showWindow('settings') },
    { type: 'separator' },
    { label: '✖ 종료', click: () => quit() },
  ]);
}

let trayKey = '';
function updateTray(snap) {
  if (!tray) return;
  // Rebuilding the menu while it is open closes it, so only rebuild when something visible changed.
  const key = JSON.stringify([snap.connection.status, snap.connection.error, snap.paused, snap.mode, snap.live?.label, summarize(snap.live?.presence), snap.currentStatusId, snap.library.map((x) => [x.id, x.label, x.favorite]), snap.override?.id, snap.settings.hotkeys]);
  if (key === trayKey) return;
  trayKey = key;
  tray.setImage(trayIcon(snap.paused || snap.connection.status !== 'connected'));
  tray.setToolTip(clip(`Discord Status Studio\n${snap.paused ? '일시정지됨' : summarize(snap.live?.presence)}`, 120));
  tray.setContextMenu(buildTrayMenu(snap));
}

// ───────────────────────── settings side-effects ─────────────────────────

function applyAutoStart(s) {
  const opts = app.isPackaged
    ? { openAtLogin: !!s.autoStart, args: ['--hidden'] }
    : { openAtLogin: !!s.autoStart, path: process.execPath, args: [app.getAppPath(), '--hidden'] };
  app.setLoginItemSettings(opts);
}

function applyHotkeys(s) {
  globalShortcut.unregisterAll();
  if (!s.hotkeys) return;
  const reg = (acc, fn) => {
    if (!globalShortcut.register(acc, fn)) log('hotkey in use:', acc);
  };
  reg('Control+Alt+Right', () => engine.nextFavorite(1));
  reg('Control+Alt+Left', () => engine.nextFavorite(-1));
  reg('Control+Alt+P', () => engine.setPaused(!engine.data.paused));
  reg('Control+Alt+S', () => showWindow());
  for (let n = 1; n <= 9; n++) {
    reg(`Control+Alt+${n}`, () => {
      const fav = engine.data.library.filter((x) => x.favorite)[n - 1];
      if (fav) {
        engine.applyStatus(fav.id);
        notify('상태 변경', `${fav.label}`);
      }
    });
  }
}

// Remote agent: report running programs to a Linux server so its rules can react.
let agentTimer = null;
let agentFailures = 0;
function scheduleAgent() {
  clearTimeout(agentTimer);
  agentTimer = setTimeout(runAgent, Math.max(10, engine.settings.pollSeconds || 10) * 1000);
}
async function runAgent() {
  const s = engine.settings;
  if (s.remoteEnabled && s.remoteUrl && s.remoteToken) {
    try {
      const procs = await listProcesses({ titles: true });
      const res = await fetch(`${s.remoteUrl.replace(/\/+$/, '')}/api/agent/report`, {
        method: 'POST',
        headers: { authorization: `Bearer ${s.remoteToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ host: os.hostname(), idleSeconds: powerMonitor.getSystemIdleTime(), procs: procs.map((p) => ({ name: p.name, title: p.title })) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (agentFailures >= 3) notify('원격 서버 연결 복구', s.remoteUrl);
      agentFailures = 0;
    } catch (e) {
      agentFailures++;
      log('agent report failed:', e.message);
      if (agentFailures === 3) notify('원격 서버에 보고 실패', `${s.remoteUrl}\n${e.message}`);
    }
  }
  scheduleAgent();
}

// ───────────────────────── lifecycle ─────────────────────────

async function quit() {
  quitting = true;
  globalShortcut.unregisterAll();
  try {
    await Promise.race([engine?.stop(), new Promise((r) => setTimeout(r, 2000))]);
  } finally {
    app.exit(0);
  }
}

app.on('second-instance', () => showWindow());
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', (e) => {
  if (!quitting) {
    e.preventDefault();
    quit();
  }
});

app.whenReady().then(async () => {
  // Serve the shared UI from app:// so ES modules and CSP work like a normal site.
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(UI_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(UI_DIR + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  engine = new StatusEngine({
    dataFile: path.join(app.getPath('userData'), 'data.json'),
    platform: {
      name: 'windows',
      listProcesses,
      getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
      notify,
    },
    log,
  });

  ipcMain.handle('call', async (_e, method, args) => {
    try {
      return { ok: true, result: await engine.call(method, args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  engine.on('snapshot', (snap) => {
    lastSnap = snap;
    if (win && !win.isDestroyed()) win.webContents.send('snapshot', snap);
    updateTray(snap);
  });
  let prevSettings = '';
  engine.on('settings', (s) => {
    const key = JSON.stringify([s.autoStart, s.hotkeys]);
    if (key !== prevSettings) {
      prevSettings = key;
      applyAutoStart(s);
      applyHotkeys(s);
    }
    scheduleAgent();
  });

  tray = new Tray(trayIcon(true));
  tray.setToolTip('Discord Status Studio');
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());

  await engine.start();
  prevSettings = JSON.stringify([engine.settings.autoStart, engine.settings.hotkeys]);
  applyHotkeys(engine.settings);
  if (engine.settings.autoStart) applyAutoStart(engine.settings);
  updateTray(engine.getSnapshot());
  scheduleAgent();

  const startHidden = process.argv.includes('--hidden') || engine.settings.startHidden;
  createWindow(!startHidden);

  // Resume presence quickly after sleep / lock.
  powerMonitor.on('resume', () => engine.reconnect());

  // `DSS_SMOKE=1 electron .` — CI/dev check: load the UI, report errors, exit.
  if (process.env.DSS_SMOKE) {
    win.webContents.on('console-message', (e) => log('[renderer]', e.level, e.message));
    win.webContents.on('did-fail-load', (_e, code, desc) => log('[renderer] load failed', code, desc));
    setTimeout(async () => {
      const report = await win.webContents.executeJavaScript(`(async () => {
        const out = { nav: document.querySelectorAll('.nav-btn').length, pages: {} };
        for (const b of document.querySelectorAll('.nav-btn')) {
          b.click();
          await new Promise((r) => setTimeout(r, 250));
          out.pages[b.dataset.page] = document.querySelector('.content')?.innerText.length || 0;
        }
        out.top = document.querySelector('.topbar')?.innerText.replace(/\\n/g, ' | ');
        return out;
      })()`);
      log('[smoke]', JSON.stringify(report));
      log('[smoke] tray menu items:', buildTrayMenu(engine.getSnapshot()).items.length);
      quit();
    }, 4000);
  }
});
