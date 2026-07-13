/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function classifyTranslationResult(translatedText) {
  const text = translatedText.trim();
  const lineCount = text === '' ? 0 : text.split('\n').length;
  const kind = text.length <= 240 && lineCount <= 3 ? 'short' : 'long';

  return {
    kind,
    text,
    preview: kind === 'short' ? text : `${text.slice(0, 237)}…`,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { classifyTranslationResult };
}
