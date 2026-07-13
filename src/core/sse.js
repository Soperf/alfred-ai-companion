/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function parseChatCompletionStream(streamText) {
  let content = '';
  let finishReason = null;
  let done = false;

  for (const line of String(streamText || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const payload = line.slice(5).trim();
    if (payload === '[DONE]') {
      done = true;
      continue;
    }

    try {
      const chunk = JSON.parse(payload);
      const choice = chunk.choices && chunk.choices[0];
      if (!choice) {
        continue;
      }
      if (typeof choice.delta?.content === 'string') {
        content += choice.delta.content;
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    } catch (_error) {
      // A partial line is expected while curl is still writing the stream.
    }
  }

  return { content, finishReason, done };
}

if (typeof module !== 'undefined') {
  module.exports = { parseChatCompletionStream };
}
