/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function buildTranslationMessages(sourceText, targetLanguage) {
  return [
    {
      role: 'system',
      content: `Translate the user content into ${targetLanguage}. Return only the translation. Preserve paragraphs, code, URLs, and placeholders. Do not add quotes, explanations, or Markdown fences.`,
    },
    { role: 'user', content: sourceText },
  ];
}

if (typeof module !== 'undefined') {
  module.exports = { buildTranslationMessages };
}
