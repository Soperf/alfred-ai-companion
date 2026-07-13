/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const HAN_CHARACTER_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;

function selectTranslationDirection(sourceText, configuration) {
  const sourceKind = HAN_CHARACTER_PATTERN.test(sourceText) ? 'han' : 'other';
  return {
    sourceKind,
    targetLanguage: sourceKind === 'han'
      ? configuration.chineseTargetLanguage
      : configuration.otherTargetLanguage,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { selectTranslationDirection };
}
