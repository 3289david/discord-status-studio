import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiDesigner } from '../src/ai.js';

test('AiDesigner sends structured-output request and parses variants', async () => {
  let body;
  const variant = {
    name: 'Coding Mode', activityType: 'playing', details: '⚡ Building something cool', state: '⌨️ Currently coding',
    largeImageEmoji: '💻', largeText: 'Coding', smallImageEmoji: '🎮', smallText: 'Gamer', customStatusEmoji: '⚡',
    customStatusText: 'coding mode', buttonLabel: '', buttonUrl: '', style: 'classic',
  };
  const fakeFetch = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify({ variants: [variant, variant] }) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const ai = new AiDesigner({ apiKey: 'sk-test', fetch: fakeFetch });
  const res = await ai.design('게임 좋아하는 개발자', { count: 2 });
  assert.equal(res.source, 'ai');
  assert.equal(res.variants.length, 2);
  assert.equal(res.variants[0].largeImage, '💻');
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
});

test('AiDesigner falls back to the offline generator without a key', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const res = await new AiDesigner({}).design('coding', { count: 3 });
  assert.equal(res.source, 'local');
  assert.equal(res.variants.length, 3);
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
});
