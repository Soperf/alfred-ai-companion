/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatCompletionRequest } = require('../../src/openai/request');

test('creates a streaming request with the configured chat model', () => {
  const request = createChatCompletionRequest({ apiEndpoint: 'https://api.example.com/v1/chat/completions', apiKey: 'secret' }, 'chat-model', [{ role: 'user', content: 'Hello' }], true);

  assert.equal(request.endpoint, 'https://api.example.com/v1/chat/completions');
  assert.deepEqual(request.headers, ['Content-Type: application/json', 'Authorization: Bearer secret']);
  assert.deepEqual(JSON.parse(request.body), {
    model: 'chat-model',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true,
  });
});

test('omits authorization for local compatible endpoints without an API key', () => {
  const request = createChatCompletionRequest({ apiEndpoint: 'http://127.0.0.1:11434/v1/chat/completions', apiKey: '' }, 'translation-model', [{ role: 'user', content: '你好' }], false);

  assert.deepEqual(request.headers, ['Content-Type: application/json']);
  assert.equal(JSON.parse(request.body).model, 'translation-model');
  assert.equal(JSON.parse(request.body).stream, false);
});
