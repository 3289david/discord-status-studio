// Automation rules: "when X is running / during these hours / when idle → use status Y".
// Rules are evaluated top to bottom; the first match wins.

export const RULE_TYPES = ['process', 'schedule', 'idle'];

function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

function tokens(match) {
  return String(match || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Returns the matched process (or null). `procs` = [{name,title,args}] */
export function matchProcess(match, procs) {
  for (const tok of tokens(match)) {
    if (tok.toLowerCase().startsWith('title:')) {
      const re = globToRegex(tok.slice(6).trim());
      const hit = procs.find((p) => p.title && re.test(p.title));
      if (hit) return hit;
      continue;
    }
    const hasGlob = /[*?]/.test(tok);
    const re = hasGlob ? globToRegex(tok) : null;
    const want = tok.toLowerCase();
    const hit = procs.find((p) => {
      const n = p.name.toLowerCase();
      if (re) return re.test(p.name) || re.test(n.replace(/\.exe$/, ''));
      return n === want || n.replace(/\.exe$/, '') === want.replace(/\.exe$/, '');
    });
    if (hit) return hit;
  }
  return null;
}

export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Schedule match with overnight support (e.g. 22:00 ~ 02:00). days: 0=Sun..6=Sat */
export function inSchedule(rule, now = new Date()) {
  const from = parseHM(rule.from);
  const to = parseHM(rule.to);
  if (from == null || to == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  const days = Array.isArray(rule.days) && rule.days.length ? rule.days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
  if (from === to) return days.includes(today);
  if (from < to) return days.includes(today) && cur >= from && cur < to;
  // overnight window
  if (cur >= from) return days.includes(today);
  if (cur < to) return days.includes(yesterday);
  return false;
}

/**
 * @param rules  [{id, enabled, type, match, from, to, days, minutes, statusId}]
 * @param ctx    {now: Date, procs: [], idleSeconds: number|null}
 * @returns {{rule, process?}|null}
 */
export function evaluateRules(rules = [], ctx = {}) {
  const now = ctx.now || new Date();
  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    if (rule.type === 'process') {
      const hit = matchProcess(rule.match, ctx.procs || []);
      if (hit && (!rule.from || !rule.to || inSchedule(rule, now))) return { rule, process: hit };
    } else if (rule.type === 'schedule') {
      if (inSchedule(rule, now)) return { rule };
    } else if (rule.type === 'idle') {
      const mins = Number(rule.minutes) || 10;
      if (ctx.idleSeconds != null && ctx.idleSeconds >= mins * 60) return { rule };
    }
  }
  return null;
}

export function describeRule(rule) {
  const days = rule.days?.length && rule.days.length < 7 ? ` (${rule.days.map((d) => '일월화수목금토'[d]).join('')})` : '';
  if (rule.type === 'process') return `${rule.match} 실행 시`;
  if (rule.type === 'schedule') return `${rule.from} ~ ${rule.to}${days}`;
  if (rule.type === 'idle') return `${rule.minutes || 10}분 동안 입력 없음`;
  return rule.type;
}
