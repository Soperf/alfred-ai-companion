/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflowDirectory = join(process.cwd(), 'workflow');
mkdirSync(workflowDirectory, { recursive: true });

const scriptHeader = '#!/usr/bin/osascript -l JavaScript\n/** Generated Workflow entry. @author xiaopeng.fxp @date 2026-07-13 */\n';
const chatScript = `${scriptHeader}
function environmentValue(variableName) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(variableName);
  return value ? value.js : '';
}
function normalizeEndpoint(baseUrl) {
  const normalizedBaseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\\/+$/, '');
  if (/\\/chat\\/completions$/.test(normalizedBaseUrl)) return normalizedBaseUrl;
  const schemeBoundary = normalizedBaseUrl.indexOf('://') + 3;
  const pathBoundary = normalizedBaseUrl.indexOf('/', schemeBoundary);
  return pathBoundary < 0 ? normalizedBaseUrl + '/v1/chat/completions' : normalizedBaseUrl + '/chat/completions';
}
function fileExists(path) {
  return $.NSFileManager.defaultManager.fileExistsAtPath(path);
}
function ensureDirectory(path) {
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, undefined, undefined);
}
function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, undefined);
}
function readText(path) {
  return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, undefined).js;
}
function removeFile(path) {
  if (fileExists(path)) $.NSFileManager.defaultManager.removeItemAtPathError(path, undefined);
}
function modifiedAt(path) {
  return $.NSFileManager.defaultManager.attributesOfItemAtPathError(path, undefined).js.NSFileModificationDate.js.getTime();
}
function loadChat(chatPath) {
  if (!fileExists(chatPath)) {
    writeText(chatPath, '[]');
    return [];
  }
  try {
    return JSON.parse(readText(chatPath));
  } catch (_error) {
    writeText(chatPath, '[]');
    return [];
  }
}
function appendChat(chatPath, message) {
  writeText(chatPath, JSON.stringify(loadChat(chatPath).concat(message)));
}
function renderChat(messages, markInterrupted) {
  return messages.reduce(function(markdown, message, messageIndex) {
    if (message.role === 'assistant') return markdown + message.content + '\\n\\n';
    if (message.role !== 'user') return markdown;
    const isLast = messageIndex === messages.length - 1;
    const nextMessage = messages[messageIndex + 1];
    const interrupted = markInterrupted && isLast && (!nextMessage || nextMessage.role !== 'assistant');
    return markdown + '# ⊙ You\\n\\n' + message.content + '\\n\\n# ⊚ Assistant\\n\\n' + (interrupted ? '[Answer Interrupted]\\n\\n' : '');
  }, '');
}
function parseStream(streamText) {
  let content = '';
  let finishReason = null;
  let done = false;
  String(streamText || '').split(/\\r?\\n/).forEach(function(line) {
    if (line.indexOf('data:') !== 0) return;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') {
      done = true;
      return;
    }
    try {
      const chunk = JSON.parse(payload);
      const choice = chunk.choices && chunk.choices[0];
      if (!choice) return;
      if (choice.delta && typeof choice.delta.content === 'string') content += choice.delta.content;
      if (choice.finish_reason) finishReason = choice.finish_reason;
    } catch (_error) {}
  });
  return { content: content, finishReason: finishReason, done: done };
}
function startStream(configuration, messages, streamPath, processPath) {
  $.NSFileManager.defaultManager.createFileAtPathContentsAttributes(streamPath, undefined, undefined);
  const requestTask = $.NSTask.alloc.init;
  const requestArguments = [
    configuration.endpoint,
    '--silent', '--show-error', '--no-buffer',
    '--speed-limit', '1', '--speed-time', String(configuration.timeoutSeconds),
    '--header', 'Content-Type: application/json'
  ];
  if (configuration.apiKey) requestArguments.push('--header', 'Authorization: Bearer ' + configuration.apiKey);
  requestArguments.push('--data', JSON.stringify({ model: configuration.model, messages: messages, stream: true }), '--output', streamPath);
  requestTask.executableURL = $.NSURL.fileURLWithPath('/usr/bin/curl');
  requestTask.arguments = requestArguments;
  requestTask.launchAndReturnError(false);
  writeText(processPath, String(requestTask.processIdentifier));
}
function readStream(streamPath, chatPath, processPath, timeoutSeconds) {
  if (environmentValue('stream_marker') === '1') {
    return JSON.stringify({ rerun: 0.1, variables: { streaming_now: true }, response: '…', behaviour: { response: 'append', scroll: 'end' } });
  }
  const streamText = readText(streamPath);
  if (streamText.indexOf('{') === 0) {
    let errorMessage = streamText.slice(0, 300);
    try {
      const errorPayload = JSON.parse(streamText);
      errorMessage = errorPayload.error && errorPayload.error.message || errorMessage;
    } catch (_error) {}
    removeFile(streamPath);
    removeFile(processPath);
    return JSON.stringify({ response: errorMessage, behaviour: { response: 'replacelast', scroll: 'end' } });
  }
  const stream = parseStream(streamText);
  const stalled = Date.now() - modifiedAt(streamPath) > timeoutSeconds * 1000;
  if (!stream.done && !stream.finishReason) {
    if (stalled) {
      if (stream.content) appendChat(chatPath, { role: 'assistant', content: stream.content });
      removeFile(streamPath);
      removeFile(processPath);
      return JSON.stringify({ response: stream.content + ' [Connection Stalled]', footer: 'Ask the model to continue', behaviour: { response: 'replacelast', scroll: 'end' } });
    }
    if (!streamText) return JSON.stringify({ rerun: 0.1, variables: { streaming_now: true } });
    return JSON.stringify({ rerun: 0.1, variables: { streaming_now: true }, response: stream.content, behaviour: { response: 'replacelast', scroll: 'end' } });
  }
  appendChat(chatPath, { role: 'assistant', content: stream.content });
  removeFile(streamPath);
  removeFile(processPath);
  const footer = stream.finishReason === 'length' ? 'Maximum token limit reached' : undefined;
  return JSON.stringify({ response: stream.content, footer: footer, behaviour: { response: 'replacelast', scroll: 'end' } });
}
function run(argv) {
  const chatModel = environmentValue('CHAT_MODEL');
  if (!chatModel) return JSON.stringify({ response: 'Configuration error: Missing CHAT_MODEL', behaviour: { scroll: 'end' } });
  const dataDirectory = environmentValue('alfred_workflow_data');
  const cacheDirectory = environmentValue('alfred_workflow_cache');
  if (!dataDirectory || !cacheDirectory) return JSON.stringify({ response: 'Configuration error: Alfred data directories are unavailable', behaviour: { scroll: 'end' } });
  ensureDirectory(dataDirectory);
  ensureDirectory(cacheDirectory);
  const chatPath = dataDirectory + '/chat.json';
  const streamPath = cacheDirectory + '/chat-stream.txt';
  const processPath = cacheDirectory + '/chat-stream.pid';
  const timeoutSeconds = parseInt(environmentValue('REQUEST_TIMEOUT_SECONDS') || '30', 10);
  const previousChat = loadChat(chatPath);
  if (environmentValue('streaming_now') === '1') return readStream(streamPath, chatPath, processPath, timeoutSeconds);
  if (fileExists(streamPath)) return JSON.stringify({ rerun: 0.1, variables: { streaming_now: true, stream_marker: true }, response: renderChat(previousChat, false), behaviour: { scroll: 'end' } });
  const userQuestion = (argv[0] || '').trim();
  if (!userQuestion) return JSON.stringify({ response: previousChat.length ? renderChat(previousChat, true) : 'Enter a question.', behaviour: { scroll: 'end' } });
  const ongoingChat = previousChat.concat({ role: 'user', content: userQuestion });
  const maxContextMessages = parseInt(environmentValue('MAX_CONTEXT_MESSAGES') || '20', 10);
  let requestMessages = ongoingChat.slice(-maxContextMessages);
  const systemPrompt = environmentValue('CHAT_SYSTEM_PROMPT');
  if (systemPrompt) requestMessages = [{ role: 'system', content: systemPrompt }].concat(requestMessages);
  startStream({ endpoint: normalizeEndpoint(environmentValue('OPENAI_BASE_URL')), apiKey: environmentValue('OPENAI_API_KEY'), model: chatModel, timeoutSeconds: timeoutSeconds }, requestMessages, streamPath, processPath);
  appendChat(chatPath, { role: 'user', content: userQuestion });
  return JSON.stringify({ rerun: 0.1, variables: { streaming_now: true, stream_marker: true }, response: renderChat(ongoingChat, false), behaviour: { scroll: 'end' } });
}
`;
const translationScript = `${scriptHeader}
function environmentValue(variableName) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(variableName);
  return value ? value.js : '';
}
function configurationError(message) {
  return JSON.stringify({ items: [{ title: 'Configuration error', subtitle: message, valid: false }] });
}
function normalizeEndpoint(baseUrl) {
  const normalizedBaseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\\/+$/, '');
  if (/\\/chat\\/completions$/.test(normalizedBaseUrl)) return normalizedBaseUrl;
  const schemeBoundary = normalizedBaseUrl.indexOf('://') + 3;
  const pathBoundary = normalizedBaseUrl.indexOf('/', schemeBoundary);
  return pathBoundary < 0 ? normalizedBaseUrl + '/v1/chat/completions' : normalizedBaseUrl + '/chat/completions';
}
function classifyTranslation(translatedText) {
  const normalizedText = translatedText.trim();
  const lineCount = normalizedText ? normalizedText.split('\\n').length : 0;
  const kind = normalizedText.length <= 240 && lineCount <= 3 ? 'short' : 'long';
  return { kind: kind, text: normalizedText, preview: kind === 'short' ? normalizedText : normalizedText.slice(0, 237) + '…' };
}
function writeTranslationCache(translatedText) {
  const cacheDirectory = environmentValue('alfred_workflow_cache');
  if (!cacheDirectory) return;
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(cacheDirectory, true, undefined, undefined);
  $(JSON.stringify({ translatedText: translatedText })).writeToFileAtomicallyEncodingError(cacheDirectory + '/translation-cache.json', true, $.NSUTF8StringEncoding, undefined);
}
function run(argv) {
  const sourceText = argv[0] || '';
  if (!sourceText.trim()) return JSON.stringify({ items: [{ title: 'Translation input required', subtitle: 'Enter text after tr', valid: false }] });
  const model = environmentValue('TRANSLATION_MODEL');
  if (!model) return configurationError('Missing TRANSLATION_MODEL');
  const endpoint = normalizeEndpoint(environmentValue('OPENAI_BASE_URL'));
  const targetLanguage = /[\\u3400-\\u9fff]/.test(sourceText)
    ? (environmentValue('CHINESE_TARGET_LANGUAGE') || 'English')
    : (environmentValue('OTHER_TARGET_LANGUAGE') || 'Simplified Chinese');
  const task = $.NSTask.alloc.init;
  const outputPipe = $.NSPipe.pipe;
  const headers = ['Content-Type: application/json'];
  const apiKey = environmentValue('OPENAI_API_KEY');
  if (apiKey) headers.push('Authorization: Bearer ' + apiKey);
  const argumentsForCurl = [endpoint, '--silent', '--show-error', '--header', headers[0]];
  if (headers[1]) argumentsForCurl.push('--header', headers[1]);
  argumentsForCurl.push('--data', JSON.stringify({ model: model, messages: [{ role: 'system', content: 'Translate the user content into ' + targetLanguage + '. Return only the translation. Preserve paragraphs, code, URLs, and placeholders.' }, { role: 'user', content: sourceText }], stream: false }));
  task.executableURL = $.NSURL.fileURLWithPath('/usr/bin/curl');
  task.arguments = argumentsForCurl;
  task.standardOutput = outputPipe;
  task.launchAndReturnError(false);
  const responseData = outputPipe.fileHandleForReading.readDataToEndOfFileAndReturnError(false);
  const response = $.NSString.alloc.initWithDataEncoding(responseData, $.NSUTF8StringEncoding).js;
  try {
    const parsed = JSON.parse(response);
    const translatedText = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
    if (!translatedText) throw new Error(parsed.error && parsed.error.message || 'Compatible API returned no message content');
    const translationResult = classifyTranslation(translatedText);
    writeTranslationCache(translationResult.text);
    return JSON.stringify({ items: [{ title: translationResult.preview, subtitle: translationResult.kind === 'long' ? 'Press Return to view full translation · ' + model : 'Translation to ' + targetLanguage + ' · ' + model, arg: translationResult.text, valid: true, variables: { translation_kind: translationResult.kind } }] });
  } catch (error) {
    return JSON.stringify({ items: [{ title: 'Translation error', subtitle: error.message || response.slice(0, 300), valid: false }] });
  }
}
`;
const translationInlineScript = translationScript.slice(scriptHeader.length);
const chatActionsScript = `${scriptHeader}
function environmentValue(variableName) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(variableName);
  return value ? value.js : '';
}
function fileExists(path) {
  return $.NSFileManager.defaultManager.fileExistsAtPath(path);
}
function ensureDirectory(path) {
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, undefined, undefined);
}
function readText(path) {
  return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, undefined).js;
}
function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, undefined);
}
function removeItem(path) {
  if (fileExists(path)) $.NSFileManager.defaultManager.removeItemAtPathError(path, undefined);
}
function terminateProcess(processIdentifierText) {
  const processIdentifier = String(processIdentifierText).trim();
  if (!/^[1-9]\\d*$/.test(processIdentifier)) return;
  const numericProcessIdentifier = Number(processIdentifier);
  if (!Number.isSafeInteger(numericProcessIdentifier)) return;
  const terminateTask = $.NSTask.alloc.init;
  terminateTask.executableURL = $.NSURL.fileURLWithPath('/bin/kill');
  terminateTask.arguments = ['-TERM', processIdentifier];
  terminateTask.launchAndReturnError(false);
}
function stopActiveStream(paths) {
  if (fileExists(paths.process)) terminateProcess(readText(paths.process));
  removeItem(paths.stream);
  removeItem(paths.process);
}
function readValidCurrentMessages(currentChatPath) {
  if (!fileExists(currentChatPath)) return [];
  try {
    const currentMessages = JSON.parse(readText(currentChatPath));
    return Array.isArray(currentMessages) ? currentMessages : [];
  } catch (_error) {
    return [];
  }
}
function archiveCurrentMessages(paths, currentMessages) {
  ensureDirectory(paths.archiveDirectory);
  const safeTimestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const uniqueIdentifier = $.NSProcessInfo.processInfo.globallyUniqueString.js;
  writeText(paths.archiveDirectory + '/' + safeTimestamp + '-' + uniqueIdentifier + '.json', JSON.stringify(currentMessages));
}
function startNewChat(paths) {
  stopActiveStream(paths);
  const currentMessages = readValidCurrentMessages(paths.currentChat);
  if (currentMessages.length > 0) archiveCurrentMessages(paths, currentMessages);
  writeText(paths.currentChat, '[]');
  return 'Started a new chat';
}
function clearAllHistory(paths) {
  stopActiveStream(paths);
  removeItem(paths.archiveDirectory);
  writeText(paths.currentChat, '[]');
  return 'Cleared all chat history';
}
function executeChatAction(actionName) {
  return run([actionName]);
}
function run(argv) {
  const actionName = argv[0] || '';
  const dataDirectory = environmentValue('alfred_workflow_data');
  const cacheDirectory = environmentValue('alfred_workflow_cache');
  const paths = {
    currentChat: dataDirectory + '/chat.json',
    archiveDirectory: dataDirectory + '/chat/archive',
    stream: cacheDirectory + '/chat-stream.txt',
    process: cacheDirectory + '/chat-stream.pid',
  };
  if (actionName === 'new') return startNewChat(paths);
  if (actionName === 'clear-all') return clearAllHistory(paths);
  throw new Error('Unsupported chat action: ' + actionName);
}
`;
const chatActionsInlineScript = chatActionsScript.slice(scriptHeader.length);
const translationViewScript = `${scriptHeader}
function environmentValue(variableName) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(variableName);
  return value ? value.js : '';
}
function run() {
  const cacheDirectory = environmentValue('alfred_workflow_cache');
  const cachePath = cacheDirectory + '/translation-cache.json';
  if (!cacheDirectory || !$.NSFileManager.defaultManager.fileExistsAtPath(cachePath)) {
    return JSON.stringify({ response: 'No translation available', behaviour: { scroll: 'end' } });
  }
  try {
    const cacheText = $.NSString.stringWithContentsOfFileEncodingError(cachePath, $.NSUTF8StringEncoding, undefined).js;
    const cachedTranslation = JSON.parse(cacheText);
    return JSON.stringify({ response: cachedTranslation.translatedText || 'No translation available', behaviour: { scroll: 'end' } });
  } catch (error) {
    return JSON.stringify({ response: 'Translation cache error: ' + (error.message || String(error)), behaviour: { scroll: 'end' } });
  }
}
`;

for (const [scriptName, scriptContent] of Object.entries({ chat: chatScript, 'chat-actions': chatActionsScript, translate: translationScript, 'translate-view': translationViewScript })) {
  const scriptPath = join(workflowDirectory, scriptName);
  writeFileSync(scriptPath, scriptContent, 'utf8');
  chmodSync(scriptPath, 0o755);
}

const keywordObject = (uid, keywordVariable, text, subtext) => ({
  uid,
  type: 'alfred.workflow.input.keyword',
  version: 1,
  config: { argumenttype: 1, keyword: `{var:${keywordVariable}}`, text, subtext, withspace: true, skipuniversalaction: true },
});
const plist = {
  bundleid: 'com.xiaopeng.fxp.alfredtranslation',
  name: 'AI Translation',
  description: 'OpenAI-compatible chat and translation',
  createdby: 'xiaopeng.fxp',
  version: '0.3.0',
  objects: [
    keywordObject('CHAT_KEYWORD_INPUT', 'CHAT_KEYWORD', 'Ask AI', 'Chat with the configured model'),
    { uid: 'CHAT_TEXT_VIEW', type: 'alfred.workflow.userinterface.text', version: 1, config: { inputfile: 'chat', inputtype: 1, scriptinput: 2, outputmode: 1, behaviour: 2, footertext: '↩ Ask a question', loadingtext: 'Contacting compatible API…', fontmode: 0, fontsizing: 0, spellchecking: 0, stackview: false } },
    { uid: 'CHAT_CLEAR_FILTER', type: 'alfred.workflow.input.scriptfilter', version: 3, config: { keyword: 'ai-clear', title: 'Clear Ask AI History', subtext: 'Press Return to review the destructive action', argumenttype: 2, scriptargtype: 1, type: 7, scriptfile: '', script: "function run() { return JSON.stringify({ items: [{ title: 'Confirm clearing all chat history', subtitle: 'This cannot be undone', arg: 'clear-all', valid: true }] }); }" } },
    { uid: 'CHAT_ACTION_NEW', type: 'alfred.workflow.action.script', version: 2, config: { type: 7, scriptfile: '', script: `${chatActionsInlineScript}\nexecuteChatAction('new');` } },
    { uid: 'CHAT_ACTION_CLEAR_ALL', type: 'alfred.workflow.action.script', version: 2, config: { type: 7, scriptfile: '', script: `${chatActionsInlineScript}\nexecuteChatAction('clear-all');` } },
    { uid: 'CHAT_NEW_NOTIFICATION', type: 'alfred.workflow.output.notification', version: 1, config: { title: 'Ask AI', text: 'Started a new chat', onlyshowifquerypopulated: false } },
    { uid: 'CHAT_CLEAR_NOTIFICATION', type: 'alfred.workflow.output.notification', version: 1, config: { title: 'Ask AI', text: 'Cleared all chat history', onlyshowifquerypopulated: false } },
    { uid: 'TRANSLATION_SCRIPT_FILTER', type: 'alfred.workflow.input.scriptfilter', version: 3, config: { keyword: '{var:TRANSLATION_KEYWORD}', scriptfile: '', script: translationInlineScript, type: 7, scriptargtype: 1, argumenttype: 0, withspace: true, queuemode: 1, queuedelaymode: 0, queuedelaycustom: 0.35, queuedelayimmediatelyinitially: true, escaping: 68, title: 'Translation', subtext: 'Translate using the configured model', alfredfiltersresults: false, alfredfiltersresultsmatchmode: 0, argumenttrimmode: 0, argumenttreatemptyqueryasnil: true, skipuniversalaction: true } },
    { uid: 'TRANSLATION_KIND_CONDITION', type: 'alfred.workflow.utility.conditional', version: 1, config: { hideelse: false, conditions: [{ inputstring: '{var:translation_kind}', matchstring: 'long', matchcasesensitive: false, matchmode: 0, outputlabel: 'Long translation', uid: 'TRANSLATION_KIND_LONG' }], elselabel: 'Short translation' } },
    { uid: 'TRANSLATION_TEXT_VIEW', type: 'alfred.workflow.userinterface.text', version: 1, config: { inputfile: 'translate-view', inputtype: 1, scriptinput: 2, outputmode: 0, behaviour: 2, footertext: '↩ Copy translation', loadingtext: 'Loading full translation…', fontmode: 0, fontsizing: 0, spellchecking: 0, stackview: false } },
    { uid: 'TRANSLATION_COPY_TO_CLIPBOARD', type: 'alfred.workflow.output.clipboard', version: 3, config: { ignoredynamicplaceholders: false, transient: false, clipboardtext: '{query}', autopaste: false } },
  ],
  connections: {
    CHAT_KEYWORD_INPUT: [{ destinationuid: 'CHAT_TEXT_VIEW', modifiers: 0, vitoclose: false }],
    CHAT_TEXT_VIEW: [{ destinationuid: 'CHAT_ACTION_NEW', modifiers: 1048576, modifiersubtext: 'Start a new chat', vitoclose: true }],
    CHAT_CLEAR_FILTER: [{ destinationuid: 'CHAT_ACTION_CLEAR_ALL', modifiers: 0, modifiersubtext: '', vitoclose: true }],
    CHAT_ACTION_NEW: [{ destinationuid: 'CHAT_NEW_NOTIFICATION', modifiers: 0, modifiersubtext: '', vitoclose: true }],
    CHAT_ACTION_CLEAR_ALL: [{ destinationuid: 'CHAT_CLEAR_NOTIFICATION', modifiers: 0, modifiersubtext: '', vitoclose: true }],
    TRANSLATION_SCRIPT_FILTER: [{ destinationuid: 'TRANSLATION_KIND_CONDITION', modifiers: 0, modifiersubtext: '', vitoclose: false }],
    TRANSLATION_KIND_CONDITION: [
      { destinationuid: 'TRANSLATION_TEXT_VIEW', sourceoutputuid: 'TRANSLATION_KIND_LONG', modifiers: 0, modifiersubtext: '', vitoclose: false },
      { destinationuid: 'TRANSLATION_COPY_TO_CLIPBOARD', modifiers: 0, modifiersubtext: '', vitoclose: false },
    ],
    TRANSLATION_TEXT_VIEW: [{ destinationuid: 'TRANSLATION_COPY_TO_CLIPBOARD', modifiers: 0, modifiersubtext: '', vitoclose: false }],
  },
  userconfigurationconfig: [
    { variable: 'OPENAI_BASE_URL', type: 'textfield', label: 'OpenAI-compatible Base URL', config: { default: 'https://api.openai.com/v1', required: true, trim: true } },
    { variable: 'OPENAI_API_KEY', type: 'textfield', label: 'API Key', config: { default: '', required: false, trim: true } },
    { variable: 'CHAT_MODEL', type: 'textfield', label: 'Chat model', config: { default: '', required: true, trim: true } },
    { variable: 'TRANSLATION_MODEL', type: 'textfield', label: 'Translation model', config: { default: '', required: true, trim: true } },
    { variable: 'CHAT_SYSTEM_PROMPT', type: 'textarea', label: 'Chat system prompt', config: { default: '', required: false, trim: true } },
    { variable: 'MAX_CONTEXT_MESSAGES', type: 'textfield', label: 'Maximum chat context messages', config: { default: '20', required: true, trim: true } },
    { variable: 'CHINESE_TARGET_LANGUAGE', type: 'textfield', label: 'Translation target for Chinese input', config: { default: 'English', required: true, trim: true } },
    { variable: 'OTHER_TARGET_LANGUAGE', type: 'textfield', label: 'Translation target for non-Chinese input', config: { default: 'Simplified Chinese', required: true, trim: true } },
    { variable: 'REQUEST_TIMEOUT_SECONDS', type: 'textfield', label: 'Request timeout (seconds)', config: { default: '30', required: true, trim: true } },
    { variable: 'CHAT_KEYWORD', type: 'textfield', label: 'Chat keyword', config: { default: 'ai', required: true, trim: true } },
    { variable: 'TRANSLATION_KEYWORD', type: 'textfield', label: 'Translation keyword', config: { default: 'tr', required: true, trim: true } },
  ],
};
const temporaryPath = join(workflowDirectory, 'info.json');
writeFileSync(temporaryPath, JSON.stringify(plist), 'utf8');
const result = spawnSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', join(workflowDirectory, 'info.plist'), temporaryPath], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Failed to create info.plist');
rmSync(temporaryPath, { force: true });
