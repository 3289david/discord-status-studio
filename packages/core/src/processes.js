// Cross-platform running-process detection + window-title parsing (Spotify, VS Code).
import { execFile } from 'node:child_process';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 15_000, ...opts }, (err, stdout) => {
      resolve(err ? '' : String(stdout));
    });
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function listWindows({ titles }) {
  const csv = await run('tasklist', ['/fo', 'csv', '/nh']);
  const procs = new Map();
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, pid] = parseCsvLine(line);
    if (name && !procs.has(name.toLowerCase())) procs.set(name.toLowerCase(), { name, pid: Number(pid), title: '' });
  }
  if (titles) {
    // PowerShell gives UTF-8 window titles regardless of the console code page.
    const ps =
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;" +
      "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress";
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
    try {
      let arr = JSON.parse(out || '[]');
      if (!Array.isArray(arr)) arr = [arr];
      for (const w of arr) {
        const key = `${w.ProcessName}.exe`.toLowerCase();
        const entry = procs.get(key) || { name: `${w.ProcessName}.exe`, pid: 0, title: '' };
        if (!entry.title) entry.title = w.MainWindowTitle;
        procs.set(key, entry);
      }
    } catch {}
  }
  return [...procs.values()];
}

async function listUnix() {
  const out = await run('ps', ['-eo', 'comm=,args=']);
  const procs = new Map();
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\S+)\s*(.*)$/);
    if (!m) continue;
    const name = m[1].split('/').pop();
    if (!procs.has(name.toLowerCase())) procs.set(name.toLowerCase(), { name, pid: 0, title: '', args: m[2] });
  }
  return [...procs.values()];
}

/** @returns {Promise<Array<{name:string,pid:number,title:string,args?:string}>>} */
export function listProcesses(opts = {}) {
  return process.platform === 'win32' ? listWindows(opts) : listUnix();
}

/** Extract rich info from well-known window titles. */
export function parseWindowInfo(procs) {
  const info = {};
  const byName = (n) => procs.find((p) => p.name.toLowerCase() === n);
  const spotify = byName('spotify.exe');
  if (spotify?.title && spotify.title.includes(' - ') && !/^spotify/i.test(spotify.title)) {
    const [artist, ...rest] = spotify.title.split(' - ');
    info.artist = artist.trim();
    info.song = rest.join(' - ').trim();
  }
  const code = byName('code.exe') || byName('cursor.exe');
  if (code?.title) {
    const parts = code.title.replace(/^●\s*/, '').split(/\s+[-—]\s+/);
    if (parts.length >= 3) {
      info.file = parts[0];
      info.project = parts[1];
    } else if (parts.length === 2) {
      info.project = parts[0];
    }
  }
  return info;
}

// Quick-add catalog for automation rules.
export const KNOWN_APPS = [
  { id: 'vscode', label: 'VS Code', match: 'Code.exe, code', theme: { emoji: '⌨️', details: '⌨️ Coding', state: 'Editing {file|code}' } },
  { id: 'cursor', label: 'Cursor', match: 'Cursor.exe, cursor', theme: { emoji: '🤖', details: '🤖 Coding with AI', state: 'in {project|a project}' } },
  { id: 'jetbrains', label: 'JetBrains IDE', match: 'idea64.exe, pycharm64.exe, webstorm64.exe, rider64.exe, clion64.exe, goland64.exe', theme: { emoji: '🧠', details: '🧠 Coding', state: 'Deep in the IDE' } },
  { id: 'vs', label: 'Visual Studio', match: 'devenv.exe', theme: { emoji: '🟣', details: '🟣 Visual Studio', state: 'Building solution' } },
  { id: 'chrome', label: 'Chrome', match: 'chrome.exe, chrome, google-chrome', theme: { emoji: '🌐', details: '🌐 Browsing the web', state: 'Too many tabs' } },
  { id: 'edge', label: 'Edge', match: 'msedge.exe', theme: { emoji: '🌐', details: '🌐 Browsing the web', state: 'Surfing' } },
  { id: 'firefox', label: 'Firefox', match: 'firefox.exe, firefox', theme: { emoji: '🦊', details: '🦊 Browsing', state: 'On the web' } },
  { id: 'minecraft', label: 'Minecraft', match: 'Minecraft.Windows.exe, MinecraftLauncher.exe, title:Minecraft*', theme: { emoji: '⛏️', details: '⛏️ Playing Minecraft', state: 'Mining another world' } },
  { id: 'spotify', label: 'Spotify', match: 'Spotify.exe, spotify', theme: { emoji: '🎵', details: '🎵 {song|Listening to Spotify}', state: '{artist|Vibing to music}', type: 2 } },
  { id: 'aftereffects', label: 'After Effects', match: 'AfterFX.exe', theme: { emoji: '🎬', details: '🎬 Editing a video', state: 'Keyframes everywhere' } },
  { id: 'premiere', label: 'Premiere Pro', match: 'Adobe Premiere Pro.exe', theme: { emoji: '🎞️', details: '🎞️ Editing a video', state: 'In the timeline' } },
  { id: 'davinci', label: 'DaVinci Resolve', match: 'Resolve.exe', theme: { emoji: '🎨', details: '🎨 Color grading', state: 'DaVinci Resolve' } },
  { id: 'photoshop', label: 'Photoshop', match: 'Photoshop.exe', theme: { emoji: '🖌️', details: '🖌️ Designing', state: 'In Photoshop' } },
  { id: 'figma', label: 'Figma', match: 'Figma.exe', theme: { emoji: '🎨', details: '🎨 Designing', state: 'Pushing pixels' } },
  { id: 'blender', label: 'Blender', match: 'blender.exe, blender', theme: { emoji: '🧊', details: '🧊 3D modeling', state: 'In Blender' } },
  { id: 'obs', label: 'OBS', match: 'obs64.exe, obs', theme: { emoji: '🔴', details: '🔴 Streaming', state: 'Live now' } },
  { id: 'steam', label: 'Steam', match: 'steam.exe', theme: { emoji: '🎮', details: '🎮 On Steam', state: 'Picking a game' } },
  { id: 'valorant', label: 'VALORANT', match: 'VALORANT-Win64-Shipping.exe', theme: { emoji: '🎯', details: '🎯 VALORANT', state: 'Clutching rounds' } },
  { id: 'lol', label: 'League of Legends', match: 'League of Legends.exe', theme: { emoji: '⚔️', details: '⚔️ League of Legends', state: 'On the Rift' } },
  { id: 'overwatch', label: 'Overwatch', match: 'Overwatch.exe', theme: { emoji: '🛡️', details: '🛡️ Overwatch', state: 'Pushing payload' } },
  { id: 'roblox', label: 'Roblox', match: 'RobloxPlayerBeta.exe', theme: { emoji: '🟥', details: '🟥 Roblox', state: 'Playing with friends' } },
  { id: 'genshin', label: 'Genshin Impact', match: 'GenshinImpact.exe', theme: { emoji: '✨', details: '✨ Genshin Impact', state: 'Exploring Teyvat' } },
  { id: 'pubg', label: 'PUBG', match: 'TslGame.exe', theme: { emoji: '🍗', details: '🍗 PUBG', state: 'Chasing chicken dinner' } },
  { id: 'maple', label: 'MapleStory', match: 'MapleStory.exe', theme: { emoji: '🍁', details: '🍁 MapleStory', state: 'Grinding levels' } },
  { id: 'osu', label: 'osu!', match: 'osu!.exe', theme: { emoji: '🎯', details: '🎯 osu!', state: 'Click the circles' } },
  { id: 'unity', label: 'Unity', match: 'Unity.exe', theme: { emoji: '🕹️', details: '🕹️ Making a game', state: 'In Unity' } },
  { id: 'unreal', label: 'Unreal Engine', match: 'UnrealEditor.exe', theme: { emoji: '🎮', details: '🎮 Making a game', state: 'In Unreal' } },
  { id: 'notion', label: 'Notion', match: 'Notion.exe', theme: { emoji: '📝', details: '📝 Planning', state: 'In Notion' } },
  { id: 'obsidian', label: 'Obsidian', match: 'Obsidian.exe, obsidian', theme: { emoji: '💜', details: '💜 Taking notes', state: 'Second brain' } },
  { id: 'office', label: 'MS Office', match: 'WINWORD.EXE, EXCEL.EXE, POWERPNT.EXE', theme: { emoji: '📊', details: '📊 Working', state: 'Office docs' } },
  { id: 'zoom', label: 'Zoom / Teams', match: 'Zoom.exe, ms-teams.exe, Teams.exe', theme: { emoji: '📹', details: '📹 In a meeting', state: 'Camera on' } },
  { id: 'fl', label: 'FL Studio', match: 'FL64.exe, FL.exe', theme: { emoji: '🎹', details: '🎹 Making beats', state: 'FL Studio' } },
  { id: 'ableton', label: 'Ableton Live', match: 'Ableton*', theme: { emoji: '🎛️', details: '🎛️ Producing', state: 'Ableton Live' } },
];
