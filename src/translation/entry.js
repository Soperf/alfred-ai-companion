/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
let selectDirection;
let buildMessages;
let classifyResult;
let createError;
let createItem;

if (typeof module !== 'undefined') {
  ({ selectTranslationDirection: selectDirection } = require('./direction'));
  ({ buildTranslationMessages: buildMessages } = require('./prompt'));
  ({ classifyTranslationResult: classifyResult } = require('./result'));
  ({ createErrorItem: createError, createTranslationItem: createItem } = require('../core/alfred-json'));
} else {
  selectDirection = selectTranslationDirection;
  buildMessages = buildTranslationMessages;
  classifyResult = classifyTranslationResult;
  createError = createErrorItem;
  createItem = createTranslationItem;
}

function createTranslationController(dependencies) {
  return {
    translate(sourceText) {
      if (!sourceText || !sourceText.trim()) return createError('Translation input required', 'Enter text after the translation keyword');
      try {
        const configuration = dependencies.loadConfig();
        const direction = selectDirection(sourceText, configuration);
        const cacheIdentity = JSON.stringify([sourceText, direction.targetLanguage, configuration.apiEndpoint, configuration.translationModel]);
        const cachedTranslation = dependencies.readCache();
        if (cachedTranslation && cachedTranslation.identity === cacheIdentity) {
          return createItem(classifyResult(cachedTranslation.translatedText), { ...direction, model: configuration.translationModel });
        }
        const response = dependencies.requestCompletion(
          configuration,
          configuration.translationModel,
          buildMessages(sourceText, direction.targetLanguage),
        );
        const translatedText = response.choices?.[0]?.message?.content;
        if (typeof translatedText !== 'string') return createError('Translation failed', 'The compatible API returned no message content');
        dependencies.writeCache({ identity: cacheIdentity, sourceText, translatedText, ...direction, model: configuration.translationModel, createdAt: new Date().toISOString() });
        return createItem(classifyResult(translatedText), { ...direction, model: configuration.translationModel });
      } catch (error) {
        return createError('Translation error', error.message || 'Unexpected translation error');
      }
    },
    view() {
      const cachedTranslation = dependencies.readCache();
      return JSON.stringify({ response: cachedTranslation?.translatedText || 'No translation available', behaviour: { scroll: 'end' } });
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { createTranslationController };
}
