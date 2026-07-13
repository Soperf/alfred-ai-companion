/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { extractApiError } = require('../../src/core/errors');
const { parseChatCompletionStream } = require('../../src/core/sse');
const { createErrorItem, createTranslationItem } = require('../../src/core/alfred-json');

test('extracts standard OpenAI errors without exposing headers', () => {
  assert.deepEqual(extractApiError(401, '{"error":{"message":"Invalid key"}}'), {
    statusCode: 401,
    message: 'Invalid key',
  });
});

test('truncates a non-standard error body to 300 characters', () => {
  const errorSummary = extractApiError(500, 'x'.repeat(500));
  assert.equal(errorSummary.statusCode, 500);
  assert.equal(errorSummary.message.length, 311);
  assert.match(errorSummary.message, /^HTTP 500: /);
  assert.match(errorSummary.message, /…$/);
});

test('parses SSE while ignoring an incomplete trailing line', () => {
  const streamText = [
    'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}',
    'data: [DONE]',
    'data: {"choices":',
  ].join('\n\n');

  assert.deepEqual(parseChatCompletionStream(streamText), {
    content: '你好',
    finishReason: 'stop',
    done: true,
  });
});

test('creates an invalid Alfred item for configuration errors', () => {
  assert.deepEqual(JSON.parse(createErrorItem('Configuration error', 'Missing CHAT_MODEL')), {
    items: [{ title: 'Configuration error', subtitle: 'Missing CHAT_MODEL', valid: false }],
  });
});

test('creates a short translation candidate with copy and paste metadata', () => {
  const result = JSON.parse(createTranslationItem(
    { kind: 'short', text: 'Hello', preview: 'Hello' },
    { sourceKind: 'han', targetLanguage: 'English', model: 'translation-model' },
  ));

  assert.equal(result.items[0].variables.translation_kind, 'short');
  assert.equal(result.items[0].mods.cmd.subtitle, 'Copy and paste');
  assert.equal(result.items[0].arg, 'Hello');
});
