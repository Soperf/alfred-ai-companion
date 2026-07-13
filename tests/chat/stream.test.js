/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateStreamState } = require('../../src/chat/stream');

test('waits for an empty new stream', () => {
  assert.deepEqual(evaluateStreamState({ streamText: '', modifiedAt: 0, now: 1000, timeoutSeconds: 30 }), { action: 'wait' });
});

test('continues an unfinished stream with partial content', () => {
  const streamText = 'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}';
  assert.deepEqual(evaluateStreamState({ streamText, modifiedAt: 1000, now: 2000, timeoutSeconds: 30 }), {
    action: 'continue', content: 'Hello',
  });
});

test('completes a finished stream', () => {
  const streamText = 'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]';
  assert.deepEqual(evaluateStreamState({ streamText, modifiedAt: 1000, now: 2000, timeoutSeconds: 30 }), {
    action: 'complete', content: 'Hello', finishReason: 'stop',
  });
});

test('marks stale partial stream as stalled', () => {
  const streamText = 'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}';
  assert.deepEqual(evaluateStreamState({ streamText, modifiedAt: 1000, now: 32000, timeoutSeconds: 30 }), {
    action: 'stalled', content: 'Hello',
  });
});

test('returns a compatible API error', () => {
  assert.deepEqual(evaluateStreamState({ streamText: '{"error":{"message":"Invalid key"}}', modifiedAt: 1000, now: 2000, timeoutSeconds: 30 }), {
    action: 'error', statusCode: 0, message: 'Invalid key',
  });
});
