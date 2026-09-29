// Live template variables inside status text, e.g. "🎵 {song}" or "🕒 {time}".
import os from 'node:os';

export const VARIABLES = [
  { key: 'time', desc: '현재 시각 (14:05)' },
  { key: 'date', desc: '날짜 (2026-09-29)' },
  { key: 'weekday', desc: '요일 (Monday)' },
  { key: 'hour', desc: '시 (14)' },
  { key: 'greeting', desc: '시간대 인사 (Good evening)' },
  { key: 'song', desc: 'Spotify 곡 제목 (Windows)' },
  { key: 'artist', desc: 'Spotify 아티스트 (Windows)' },
  { key: 'file', desc: 'VS Code 열린 파일 (Windows)' },
  { key: 'project', desc: 'VS Code 프로젝트 (Windows)' },
  { key: 'app', desc: '규칙에 매칭된 프로그램' },
  { key: 'cpu', desc: 'CPU 사용률 %' },
  { key: 'mem', desc: '메모리 사용률 %' },
  { key: 'uptime', desc: '시스템 가동 시간 (3h 12m)' },
  { key: 'os', desc: 'OS 이름' },
  { key: 'status_count', desc: '오늘 상태 변경 횟수' },
  { key: 'random:a|b|c', desc: '매번 랜덤 선택' },
  { key: 'song|기본값', desc: '값이 없을 때 대신 보여줄 글' },
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

let lastCpu = os.cpus().map((c) => c.times);
function cpuPercent() {
  const now = os.cpus().map((c) => c.times);
  let idle = 0;
  let total = 0;
  now.forEach((t, i) => {
    const p = lastCpu[i] || t;
    const dt = (k) => t[k] - p[k];
    const tot = dt('user') + dt('nice') + dt('sys') + dt('idle') + dt('irq');
    idle += dt('idle');
    total += tot;
  });
  lastCpu = now;
  return total > 0 ? Math.round(100 - (idle / total) * 100) : 0;
}

export function baseVariables(now = new Date()) {
  const h = now.getHours();
  return {
    time: `${pad(h)}:${pad(now.getMinutes())}`,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: WEEKDAYS[now.getDay()],
    hour: String(h),
    greeting: h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening',
    cpu: String(cpuPercent()),
    mem: String(Math.round((1 - os.freemem() / os.totalmem()) * 100)),
    uptime: fmtDuration(os.uptime()),
    os: { win32: 'Windows', linux: 'Linux', darwin: 'macOS' }[process.platform] || process.platform,
  };
}

export function hasTemplate(str) {
  return typeof str === 'string' && /\{[a-z_]+(?:[:|][^}]*)?\}/i.test(str);
}

/** Replace {vars}. Unknown/empty variables collapse so the line never shows "{song}". */
export function render(str, vars = {}) {
  if (typeof str !== 'string' || !str.includes('{')) return str;
  return str
    .replace(/\{random:([^}]*)\}/gi, (_, list) => {
      const opts = list.split('|').map((s) => s.trim()).filter(Boolean);
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : '';
    })
    .replace(/\{([a-z_]+)(?:\|([^}]*))?\}/gi, (m, key, fallback) => {
      const v = vars[key.toLowerCase()];
      return v == null || v === '' ? fallback ?? '' : String(v);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const TEXT_FIELDS = ['name', 'details', 'state', 'largeText', 'smallText'];

export function renderPresence(p, vars) {
  const out = { ...p, buttons: (p.buttons || []).map((b) => ({ ...b, label: render(b.label, vars) })) };
  for (const f of TEXT_FIELDS) out[f] = render(p[f], vars);
  if (p.customStatus) out.customStatus = { ...p.customStatus, text: render(p.customStatus.text, vars) };
  return out;
}

export function presenceUsesVars(p, keys) {
  const text = [...TEXT_FIELDS.map((f) => p?.[f]), p?.customStatus?.text, ...(p?.buttons || []).map((b) => b.label)].join(' ');
  return keys.some((k) => text.includes(`{${k}}`) || text.includes(`{${k}|`));
}
