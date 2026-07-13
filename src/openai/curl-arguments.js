/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function createCurlArguments(request, outputPath, timeoutSeconds) {
  const argumentsForCurl = [
    request.endpoint,
    '--silent',
    '--show-error',
    '--no-buffer',
    '--connect-timeout',
    String(timeoutSeconds),
  ];

  for (const header of request.headers) {
    argumentsForCurl.push('--header', header);
  }

  argumentsForCurl.push('--data', request.body, '--output', outputPath);
  return argumentsForCurl;
}

if (typeof module !== 'undefined') {
  module.exports = { createCurlArguments };
}
