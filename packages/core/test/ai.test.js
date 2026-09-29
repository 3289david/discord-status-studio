import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiDesigner, parseVariants } from '../src/ai.js';

const variant = {
  name: 'Coding Mode', activityType: 'playing', details: '⚡ Building something cool', state: '⌨️ Currently coding',
  largeImageEmoji: '💻', largeText: 'Coding', smallImageEmoji: '🎮', smallText: 'Gamer', customStatusEmoji: '⚡',
  customStatusText: 'coding mode', buttonLabel: '', buttonUrl: '', style: 'classic',
};

const reply = (content, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { choices: [{ message: { role: 'assistant', content } }] } : { error: { code: status, message: content } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('AiDesigner sends an OpenRouter structured-output request and parses variants', async () => {
  let req;
  const fakeFetch = async (url, init) => {
    req = { url, headers: init.headers, body: JSON.parse(init.body) };
    return reply(JSON.stringify({ variants: [variant, variant] }));
  };
  const ai = new AiDesigner({ apiKey: 'sk-or-test', model: 'openai/gpt-4o-mini', fetch: fakeFetch });
  const res = await ai.design('게임 좋아하는 개발자', { count: 2 });
  assert.equal(res.source, 'ai');
  assert.equal(res.variants.length, 2);
  assert.equal(res.variants[0].largeImage, '💻');
  assert.equal(req.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(req.headers.authorization, 'Bearer sk-or-test');
  assert.equal(req.body.model, 'openai/gpt-4o-mini');
  assert.equal(req.body.response_format.type, 'json_schema');
  assert.equal(req.body.messages[0].role, 'system');
});

test('retries without response_format when the model rejects structured outputs', async () => {
  const calls = [];
  const fakeFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(!!body.response_format);
    if (body.response_format) return reply('response_format not supported', 400);
    return reply('Sure! ```json\n' + JSON.stringify({ variants: [variant] }) + '\n```');
  };
  const res = await new AiDesigner({ apiKey: 'k', fetch: fakeFetch }).design('coding', { count: 1 });
  assert.deepEqual(calls, [true, false]);
  assert.equal(res.source, 'ai');
  assert.equal(res.variants[0].details, '⚡ Building something cool');
});

test('auth errors fall back to the offline generator with a readable message', async () => {
  const res = await new AiDesigner({ apiKey: 'bad', fetch: async () => reply('No auth', 401) }).design('coding', { count: 2 });
  assert.equal(res.source, 'local');
  assert.match(res.error, /API 키/);
  assert.equal(res.variants.length, 2);
});

test('no key → offline generator', async () => {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const res = await new AiDesigner({}).design('coding', { count: 3 });
  assert.equal(res.source, 'local');
  assert.equal(res.variants.length, 3);
  if (saved) process.env.OPENROUTER_API_KEY = saved;
});

test('parseVariants tolerates arrays, single objects and prose', () => {
  assert.equal(parseVariants(JSON.stringify([variant])).length, 1);
  assert.equal(parseVariants(`here you go: ${JSON.stringify(variant)} enjoy`).length, 1);
  assert.equal(parseVariants('nonsense').length, 0);
});
