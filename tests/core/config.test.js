/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeChatCompletionsUrl,
  loadWorkflowConfig,
} = require('../../src/core/config');

test('normalizes compatible endpoint forms', () => {
  assert.equal(
    normalizeChatCompletionsUrl('https://api.example.com'),
    'https://api.example.com/v1/chat/completions',
  );
  assert.equal(
    normalizeChatCompletionsUrl('https://api.example.com/v1/'),
    'https://api.example.com/v1/chat/completions',
  );
  assert.equal(
    normalizeChatCompletionsUrl('http://127.0.0.1:11434/v1/chat/completions'),
    'http://127.0.0.1:11434/v1/chat/completions',
  );
});

test('rejects non-http endpoints', () => {
  assert.throws(
    () => normalizeChatCompletionsUrl('file:///tmp/api'),
    /http or https/,
  );
});

test('loads separate chat and translation models', () => {
  const environmentValues = {
    OPENAI_BASE_URL: 'https://api.example.com/v1',
    OPENAI_API_KEY: '',
    CHAT_MODEL: 'chat-model',
    TRANSLATION_MODEL: 'translation-model',
    MAX_CONTEXT_MESSAGES: '20',
    REQUEST_TIMEOUT_SECONDS: '30',
    KEEP_CHAT_HISTORY: '1',
  };

  const configuration = loadWorkflowConfig((variableName) => environmentValues[variableName]);

  assert.equal(configuration.chatModel, 'chat-model');
  assert.equal(configuration.translationModel, 'translation-model');
  assert.equal(configuration.apiKey, '');
  assert.equal(configuration.keepChatHistory, true);
});

test('reports every missing required model', () => {
  assert.throws(
    () => loadWorkflowConfig((variableName) => ({ OPENAI_BASE_URL: 'https://api.example.com/v1' })[variableName]),
    /CHAT_MODEL, TRANSLATION_MODEL/,
  );
});

test('rejects values outside numeric configuration bounds', () => {
  const environmentValues = {
    OPENAI_BASE_URL: 'https://api.example.com/v1',
    CHAT_MODEL: 'chat-model',
    TRANSLATION_MODEL: 'translation-model',
    MAX_CONTEXT_MESSAGES: '51',
    REQUEST_TIMEOUT_SECONDS: '4',
  };

  assert.throws(
    () => loadWorkflowConfig((variableName) => environmentValues[variableName]),
    /MAX_CONTEXT_MESSAGES must be between 2 and 50/,
  );
});
