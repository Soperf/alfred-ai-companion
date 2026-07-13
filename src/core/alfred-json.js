/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function createErrorItem(title, subtitle) {
  return JSON.stringify({
    items: [{ title, subtitle, valid: false }],
  });
}

function createTranslationItem(result, metadata) {
  return JSON.stringify({
    items: [{
      title: result.preview,
      subtitle: `${metadata.sourceKind} → ${metadata.targetLanguage} · ${metadata.model}`,
      arg: result.text,
      valid: true,
      variables: { translation_kind: result.kind },
      mods: {
        cmd: {
          arg: result.text,
          subtitle: result.kind === 'short' ? 'Copy and paste' : 'Copy full translation',
        },
      },
    }],
  });
}

if (typeof module !== 'undefined') {
  module.exports = { createErrorItem, createTranslationItem };
}
