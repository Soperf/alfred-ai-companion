/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function createChatCompletionRequest(configuration, model, messages, stream) {
  const headers = ['Content-Type: application/json'];
  if (configuration.apiKey) {
    headers.push(`Authorization: Bearer ${configuration.apiKey}`);
  }

  return {
    endpoint: configuration.apiEndpoint,
    headers,
    body: JSON.stringify({ model, messages, stream }),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { createChatCompletionRequest };
}
