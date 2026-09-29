import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  toRpcActivity, toGatewayActivities, fitText, twemojiUrl, isEmojiOnly, normalizePresence,
  generate, restyle, detectTopics, extractLink, applyStyle, STYLES,
  render, evaluateRules, inSchedule, matchProcess, parseWindowInfo,
  FONTS, THEMES, StatusEngine,
} from '../src/index.js';

test('fitText pads short and truncates long text', () => {
  assert.equal(Array.from(fitText('a')).length, 2);
  assert.equal(Array.from(fitText('x'.repeat(200))).length, 128);
  assert.equal(fitText('   '), undefined);
});

test('emoji images resolve to twemoji', () => {
  assert.ok(isEmojiOnly('⚡'));
  assert.ok(isEmojiOnly('🧑‍💻'));
  assert.ok(!isEmojiOnly('coding'));
  assert.match(twemojiUrl('⚡'), /26a1\.png$/);
  assert.match(twemojiUrl('⌨️'), /2328\.png$/);
});

test('toRpcActivity builds a valid activity', () => {
  const a = toRpcActivity(
    {
      details: '⚡ Coding', state: 'Building', largeImage: '💻', largeText: 'Coding',
      buttons: [{ label: 'Site', url: 'https://example.com' }, { label: 'bad', url: 'nope' }],
      timestamps: { mode: 'session' }, statusDisplay: 'details',
    },
    { sessionStart: 1000 },
  );
  assert.equal(a.details, '⚡ Coding');
  assert.equal(a.assets.large_image.startsWith('https://'), true);
  assert.equal(a.buttons.length, 1);
  assert.deepEqual(a.timestamps, { start: 1000 });
  assert.equal(a.status_display_type, 2);
});

test('gateway activities: user gets buttons as metadata, bot gets name only', () => {
  const p = { name: 'Coding Mode', details: 'x1', state: 'y1', buttons: [{ label: 'Site', url: 'https://a.b' }], customStatus: { emoji: '⚡', text: 'hi' } };
  const user = toGatewayActivities(p, {}, {});
  assert.equal(user[0].type, 4);
  assert.deepEqual(user[1].buttons, ['Site']);
  assert.deepEqual(user[1].metadata.button_urls, ['https://a.b']);
  const bot = toGatewayActivities(p, {}, { bot: true });
  assert.equal(bot.length, 1);
  assert.equal(bot[0].name, 'Coding Mode');
  assert.equal(bot[0].buttons, undefined);
});

test('topic detection understands Korean', () => {
  assert.equal(detectTopics('Minecraft 서버 개발 중')[0].id, 'minecraft');
  const ids = detectTopics('게임 좋아하고 개발하는 사람 느낌으로 만들어줘').map((t) => t.id);
  assert.ok(ids.includes('gaming') && ids.includes('coding'));
  assert.equal(detectTopics('공부 중')[0].id, 'study');
});

test('generate extracts links into state + button', () => {
  assert.deepEqual(extractLink('서버 mc.krl.kr 개발'), { raw: 'mc.krl.kr', url: 'https://mc.krl.kr' });
  const [v] = generate('Minecraft 서버 개발 중 mc.krl.kr', { count: 1, seed: 42 });
  assert.equal(v.state, 'mc.krl.kr');
  assert.equal(v.buttons[0].url, 'https://mc.krl.kr');
  assert.match(v.name, /Development|Dev/);
});

test('generate is deterministic for a seed and returns count variants', () => {
  const a = generate('coding', { count: 5, seed: 7 });
  const b = generate('coding', { count: 5, seed: 7 });
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
});

test('restyle changes style but keeps topic', () => {
  const p = normalizePresence({ details: 'Playing Minecraft', state: '' });
  const r1 = restyle(p, 0);
  const r2 = restyle(p, 1);
  assert.notEqual(r1.details, r2.details);
  assert.notEqual(r1._style, r2._style);
});

test('applyStyle renders every style without throwing', () => {
  for (const s of STYLES) {
    const out = applyStyle({ details: '⚡ Coding', state: 'Building something' }, s.id);
    assert.ok(out.details.length > 0, s.id);
  }
});

test('unicode fonts', () => {
  assert.equal(FONTS.bold('Ab1'), '𝐀𝐛𝟏');
  assert.equal(FONTS.smallCaps('code'), 'ᴄᴏᴅᴇ');
});

test('template variables render and collapse unknowns', () => {
  assert.equal(render('🎵 {song} by {artist}', { song: 'Hello', artist: 'Adele' }), '🎵 Hello by Adele');
  assert.equal(render('{missing} hi', {}), 'hi');
  assert.ok(['a', 'b'].includes(render('{random:a|b}', {})));
});

test('schedule supports overnight windows and weekdays', () => {
  const at = (h, m, day = 3) => {
    const d = new Date(2026, 8, 27 + day, h, m); // 2026-09-27 is a Sunday
    return d;
  };
  assert.ok(inSchedule({ from: '09:00', to: '16:00' }, at(10, 0)));
  assert.ok(!inSchedule({ from: '09:00', to: '16:00' }, at(16, 0)));
  assert.ok(inSchedule({ from: '22:00', to: '02:00' }, at(23, 30)));
  assert.ok(inSchedule({ from: '22:00', to: '02:00' }, at(1, 0)));
  assert.ok(!inSchedule({ from: '22:00', to: '02:00' }, at(3, 0)));
  // Mon-only overnight rule still matches early Tuesday morning
  assert.ok(inSchedule({ from: '22:00', to: '02:00', days: [1] }, at(1, 0, 2)));
  assert.ok(!inSchedule({ from: '22:00', to: '02:00', days: [1] }, at(23, 0, 2)));
});

test('process matching: exact, no .exe, glob and title', () => {
  const procs = [{ name: 'Code.exe', title: 'index.js - my-app - Visual Studio Code' }, { name: 'javaw.exe', title: 'Minecraft 1.21.1' }, { name: 'Ableton Live 12 Suite.exe', title: '' }];
  assert.equal(matchProcess('code', procs).name, 'Code.exe');
  assert.equal(matchProcess('CODE.EXE', procs).name, 'Code.exe');
  assert.equal(matchProcess('Ableton*', procs).name, 'Ableton Live 12 Suite.exe');
  assert.equal(matchProcess('title:Minecraft*', procs).name, 'javaw.exe');
  assert.equal(matchProcess('chrome', procs), null);
});

test('rules: first match wins, idle rule', () => {
  const rules = [
    { id: 'a', type: 'process', match: 'Spotify.exe', statusId: 's1' },
    { id: 'b', type: 'idle', minutes: 5, statusId: 's2' },
    { id: 'c', type: 'schedule', from: '00:00', to: '00:00', statusId: 's3' },
  ];
  assert.equal(evaluateRules(rules, { procs: [{ name: 'Spotify.exe' }], idleSeconds: 999 }).rule.id, 'a');
  assert.equal(evaluateRules(rules, { procs: [], idleSeconds: 400 }).rule.id, 'b');
  assert.equal(evaluateRules(rules, { procs: [], idleSeconds: 0 }).rule.id, 'c');
});

test('window info parsing (Spotify / VS Code)', () => {
  const info = parseWindowInfo([
    { name: 'Spotify.exe', title: 'NewJeans - Supernatural' },
    { name: 'Code.exe', title: '● engine.js - discord-status-studio - Visual Studio Code' },
  ]);
  assert.equal(info.artist, 'NewJeans');
  assert.equal(info.song, 'Supernatural');
  assert.equal(info.file, 'engine.js');
  assert.equal(info.project, 'discord-status-studio');
});

test('at least 12 themes, all valid', () => {
  assert.ok(THEMES.length >= 12);
  for (const t of THEMES) assert.ok(toRpcActivity(t.presence).details, t.id);
});

test('engine: library, rules, rotation, timer, share codes (no Discord)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dss-'));
  const engine = new StatusEngine({
    dataFile: path.join(dir, 'data.json'),
    platform: { name: 'test', listProcesses: async () => [{ name: 'Spotify.exe', title: 'Artist - Song' }], getIdleSeconds: () => 0 },
    log: () => {},
  });
  engine.setSettings({ transport: 'none' });
  engine.applyTheme('developer');
  assert.equal(engine.live.source, 'manual');

  engine.saveStatus({ label: 'Music', presence: { details: '🎵 {song}', state: 'by {artist}' } });
  const music = engine.data.library.at(-1);
  engine.setRules([{ type: 'process', match: 'spotify', statusId: music.id }]);
  engine.setMode('auto');
  await engine.tick();
  assert.equal(engine.live.source, 'rule');
  assert.equal(engine.live.presence.details, '🎵 Song');
  assert.equal(engine.live.presence.state, 'by Artist');

  engine.startTimer({ minutes: 5, label: 'Focus' });
  assert.equal(engine.live.source, 'timer');
  engine.cancelTimer();

  const code = engine.shareCode(music.id);
  engine.importShareCode(code);
  assert.equal(engine.data.library.length, 2);

  engine.setRotation({ statusIds: engine.data.library.map((x) => x.id), intervalSec: 60 });
  engine.setMode('rotation');
  assert.equal(engine.live.source, 'rotation');

  engine.setPaused(true);
  assert.equal(engine.live.presence, null);

  const masked = engine.getSnapshot().settings;
  engine.setSettings({ openrouterKey: 'sk-test' });
  assert.equal(engine.getSnapshot().settings.openrouterKey, '__keep__');
  engine.setSettings({ openrouterKey: '__keep__' });
  assert.equal(engine.settings.openrouterKey, 'sk-test');
  assert.equal(masked.has_openrouterKey, false);

  await assert.rejects(engine.call('store', []), /Unknown method/);
  await engine.stop();
});

test('keyword matching respects word boundaries', () => {
  assert.equal(detectTopics('Building something').find((t) => t.id === 'design'), undefined);
  assert.equal(detectTopics('Turning coffee into code')[0].id, 'coding');
  assert.equal(detectTopics('I love AI')[0].id, 'ai');
  assert.equal(detectTopics('aim training').find((t) => t.id === 'ai'), undefined);
  const mixed = generate('게임 좋아하고 개발하는 사람', { count: 1, seed: 3 })[0];
  assert.ok(/🎮|🕹️|👾|🔥|🏆|⌨️|⚡|💻|🧑‍💻|🛠️/u.test(mixed.state + mixed.details));
});

test('template fallback syntax', () => {
  assert.equal(render('🎵 {song|Spotify}', {}), '🎵 Spotify');
  assert.equal(render('🎵 {song|Spotify}', { song: 'Ditto' }), '🎵 Ditto');
});
