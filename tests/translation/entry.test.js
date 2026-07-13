/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTranslationController } = require('../../src/translation/entry');

function createController(overrides = {}) {
  const calls = [];
  const cache = { value: null };
  const dependencies = {
    loadConfig: () => ({ apiEndpoint: 'https://api.example.com/v1/chat/completions', translationModel: 'translation-model', chineseTargetLanguage: 'English', otherTargetLanguage: 'Simplified Chinese' }),
    requestCompletion: (_configuration, model, messages) => {
      calls.push({ model, messages });
      return { choices: [{ message: { content: 'Hello' } }] };
    },
    readCache: () => cache.value,
    writeCache: (value) => { cache.value = value; },
    ...overrides,
  };
  return { controller: createTranslationController(dependencies), calls, cache };
}

test('uses translation model and returns a short Alfred candidate', () => {
  const { controller, calls } = createController();
  const output = JSON.parse(controller.translate('你好'));

  assert.equal(calls[0].model, 'translation-model');
  assert.equal(calls[0].messages[1].content, '你好');
  assert.equal(output.items[0].title, 'Hello');
  assert.equal(output.items[0].variables.translation_kind, 'short');
});

test('returns configuration errors as invalid Alfred candidates', () => {
  const { controller } = createController({ loadConfig: () => { throw new Error('Missing configuration: TRANSLATION_MODEL'); } });
  const output = JSON.parse(controller.translate('你好'));

  assert.equal(output.items[0].valid, false);
  assert.match(output.items[0].subtitle, /TRANSLATION_MODEL/);
});

test('returns the cached long translation in Text View form', () => {
  const { controller } = createController({
    readCache: () => ({ translatedText: 'A long translation' }),
  });

  assert.deepEqual(JSON.parse(controller.view()), {
    response: 'A long translation',
    behaviour: { scroll: 'end' },
  });
});
