/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createCurlArguments } = require('../../src/openai/curl-arguments');

test('creates curl arguments without shell interpolation', () => {
  const argumentsForCurl = createCurlArguments(
    {
      endpoint: 'https://api.example.com/v1/chat/completions',
      headers: ['Content-Type: application/json', 'Authorization: Bearer key'],
      body: '{"model":"test"}',
    },
    '/tmp/response.txt',
    30,
  );

  assert.deepEqual(argumentsForCurl, [
    'https://api.example.com/v1/chat/completions',
    '--silent', '--show-error', '--no-buffer', '--connect-timeout', '30',
    '--header', 'Content-Type: application/json',
    '--header', 'Authorization: Bearer key',
    '--data', '{"model":"test"}',
    '--output', '/tmp/response.txt',
  ]);
});
