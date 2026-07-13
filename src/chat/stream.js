/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
let parseStream;

if (typeof module !== 'undefined') {
  ({ parseChatCompletionStream: parseStream } = require('../core/sse'));
} else {
  parseStream = parseChatCompletionStream;
}

function evaluateStreamState(input) {
  if (String(input.streamText || '').startsWith('{')) {
    const parsedError = JSON.parse(input.streamText);
    return {
      action: 'error',
      statusCode: 0,
      message: parsedError.error?.message || 'Unexpected API error',
    };
  }

  if (!input.streamText) return { action: 'wait' };

  const streamData = parseStream(input.streamText);
  if (streamData.done || streamData.finishReason) {
    return {
      action: 'complete',
      content: streamData.content,
      finishReason: streamData.finishReason,
    };
  }

  if (input.now - input.modifiedAt > input.timeoutSeconds * 1000) {
    return { action: 'stalled', content: streamData.content };
  }

  return { action: 'continue', content: streamData.content };
}

if (typeof module !== 'undefined') {
  module.exports = { evaluateStreamState };
}
