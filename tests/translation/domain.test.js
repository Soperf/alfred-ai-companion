/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { selectTranslationDirection } = require('../../src/translation/direction');
const { buildTranslationMessages } = require('../../src/translation/prompt');
const { classifyTranslationResult } = require('../../src/translation/result');

const translationConfiguration = {
  chineseTargetLanguage: 'English',
  otherTargetLanguage: 'Simplified Chinese',
};

test('routes Han text to the configured Chinese target', () => {
  assert.deepEqual(
    selectTranslationDirection('你好 Alfred', translationConfiguration),
    { sourceKind: 'han', targetLanguage: 'English' },
  );
  assert.deepEqual(
    selectTranslationDirection('hello Alfred', translationConfiguration),
    { sourceKind: 'other', targetLanguage: 'Simplified Chinese' },
  );
});

test('builds a format-preserving translation request', () => {
  const messages = buildTranslationMessages('Hello {name}\n`code`', 'Simplified Chinese');

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /only the translation/i);
  assert.match(messages[0].content, /placeholders/i);
  assert.equal(messages[1].content, 'Hello {name}\n`code`');
});

test('classifies exact length and line boundaries', () => {
  assert.equal(classifyTranslationResult('x'.repeat(240)).kind, 'short');
  assert.equal(classifyTranslationResult('x'.repeat(241)).kind, 'long');
  assert.equal(classifyTranslationResult('one\ntwo\nthree').kind, 'short');
  assert.equal(classifyTranslationResult('one\ntwo\nthree\nfour').kind, 'long');
});
