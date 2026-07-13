/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function extractApiError(statusCode, responseBody) {
  try {
    const parsedBody = JSON.parse(responseBody);
    if (parsedBody.error && typeof parsedBody.error.message === 'string') {
      return { statusCode, message: parsedBody.error.message };
    }
  } catch (_error) {
    // Fall through to the safe non-standard response summary.
  }

  const safeBody = String(responseBody || '').trim();
  const truncatedBody = safeBody.length > 300 ? `${safeBody.slice(0, 300)}…` : safeBody;
  return {
    statusCode,
    message: `HTTP ${statusCode}: ${truncatedBody}`,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { extractApiError };
}
