/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const {
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const projectRoot = join(__dirname, '../..');
const workflowDirectory = join(projectRoot, 'workflow');

test('build generates an importable Alfred Workflow skeleton', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  execFileSync('/usr/bin/plutil', ['-lint', join(workflowDirectory, 'info.plist')], { stdio: 'pipe' });

  for (const scriptName of ['chat', 'chat-actions', 'translate', 'translate-view']) {
    const scriptPath = join(workflowDirectory, scriptName);
    assert.equal(existsSync(scriptPath), true);
    assert.match(readFileSync(scriptPath, 'utf8'), /^#!\/usr\/bin\/osascript -l JavaScript/);
    assert.notEqual(statSync(scriptPath).mode & 0o111, 0);
  }

  const plistText = readFileSync(join(workflowDirectory, 'info.plist'), 'utf8');
  const objectsJson = execFileSync('/usr/bin/plutil', ['-extract', 'objects', 'json', '-o', '-', join(workflowDirectory, 'info.plist')], { encoding: 'utf8' });
  assert.equal(Array.isArray(JSON.parse(objectsJson)), true);
  assert.match(plistText, /com\.xiaopeng\.fxp\.alfredtranslation/);
  assert.match(plistText, /AI Companion/);
  assert.match(plistText, /CHAT_KEYWORD/);
  assert.match(plistText, /TRANSLATION_KEYWORD/);
  assert.match(plistText, /CHAT_SYSTEM_PROMPT/);
  assert.match(plistText, /CHINESE_TARGET_LANGUAGE/);
  assert.match(plistText, /OTHER_TARGET_LANGUAGE/);
  assert.match(plistText, /REQUEST_TIMEOUT_SECONDS/);
  assert.match(plistText, /MAX_CONTEXT_MESSAGES/);

  const workflowObjects = JSON.parse(objectsJson);
  const translationScriptFilter = workflowObjects.find((workflowObject) => workflowObject.uid === 'TRANSLATION_SCRIPT_FILTER');
  assert.equal(translationScriptFilter.config.keyword, '{var:TRANSLATION_KEYWORD}');
  assert.equal(translationScriptFilter.config.argumenttype, 0);
  assert.equal(translationScriptFilter.config.scriptargtype, 1);
  assert.equal(translationScriptFilter.config.alfredfiltersresults, false);
  assert.equal(translationScriptFilter.config.type, 7);
  assert.equal(translationScriptFilter.config.scriptfile, '');
  assert.match(translationScriptFilter.config.script, /function run\(argv\)/);
  assert.equal(plistText.includes('<key>TRANSLATION_KEYWORD_INPUT</key>'), false);

  const translationClipboard = workflowObjects.find((workflowObject) => workflowObject.uid === 'TRANSLATION_COPY_TO_CLIPBOARD');
  assert.equal(translationClipboard.type, 'alfred.workflow.output.clipboard');
  assert.deepEqual(translationClipboard.config, {
    ignoredynamicplaceholders: false,
    transient: false,
    clipboardtext: '{query}',
    autopaste: false,
  });

  const connectionsJson = execFileSync('/usr/bin/plutil', ['-extract', 'connections', 'json', '-o', '-', join(workflowDirectory, 'info.plist')], { encoding: 'utf8' });
  const workflowConnections = JSON.parse(connectionsJson);
  assert.deepEqual(workflowConnections.TRANSLATION_SCRIPT_FILTER, [{
    destinationuid: 'TRANSLATION_KIND_CONDITION',
    modifiers: 0,
    modifiersubtext: '',
    vitoclose: false,
  }]);

  const newChatConnection = workflowConnections.CHAT_TEXT_VIEW.find(
    (connection) => connection.modifiers === 1048576,
  );
  assert.equal(newChatConnection.destinationuid, 'CHAT_ACTION_NEW');
  assert.equal(newChatConnection.vitoclose, true);

  const clearFilter = workflowObjects.find((workflowObject) => workflowObject.uid === 'CHAT_CLEAR_FILTER');
  assert.equal(clearFilter.type, 'alfred.workflow.input.scriptfilter');
  assert.equal(clearFilter.config.keyword, 'ai-clear');
  assert.match(clearFilter.config.script, /Confirm clearing all chat history/);

  const newChatAction = workflowObjects.find((workflowObject) => workflowObject.uid === 'CHAT_ACTION_NEW');
  const clearAllAction = workflowObjects.find((workflowObject) => workflowObject.uid === 'CHAT_ACTION_CLEAR_ALL');
  assert.match(newChatAction.config.script, /executeChatAction\('new'\)/);
  assert.match(clearAllAction.config.script, /executeChatAction\('clear-all'\)/);
  assert.equal(workflowConnections.CHAT_CLEAR_FILTER[0].destinationuid, 'CHAT_ACTION_CLEAR_ALL');
  assert.equal(workflowConnections.CHAT_ACTION_NEW[0].destinationuid, 'CHAT_NEW_NOTIFICATION');
  assert.equal(workflowConnections.CHAT_ACTION_CLEAR_ALL[0].destinationuid, 'CHAT_CLEAR_NOTIFICATION');
});

test('generated chat action entry terminates only a validated positive process identifier', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const scriptText = readFileSync(join(workflowDirectory, 'chat-actions'), 'utf8');

  assert.match(scriptText, /^#!\/usr\/bin\/osascript -l JavaScript/);
  assert.equal(scriptText.includes('/^[1-9]\\d*$/' + '.test(processIdentifier)'), true);
  assert.match(scriptText, /executableURL = \$\.NSURL\.fileURLWithPath\('\/bin\/kill'\)/);
  assert.match(scriptText, /arguments = \['-TERM', processIdentifier\]/);
  assert.doesNotMatch(scriptText, /doShellScript/);
});

test('README documents streaming chat as available', () => {
  const readmeText = readFileSync(join(projectRoot, 'README.md'), 'utf8');

  assert.match(readmeText, /SSE streaming/);
  assert.doesNotMatch(readmeText, /Streaming chat and conversation history are still under development/);
  assert.match(readmeText, /⌘↩/);
  assert.match(readmeText, /ai-clear/);
  assert.match(readmeText, /clear all chat history/);
});

test('generated chat action entry manages isolated Alfred history at runtime', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'alfred-translation-chat-actions-'));
  const dataDirectory = join(temporaryRoot, 'data');
  const cacheDirectory = join(temporaryRoot, 'cache');
  const currentChatPath = join(dataDirectory, 'chat.json');
  const archiveDirectory = join(dataDirectory, 'chat', 'archive');
  const translationCachePath = join(cacheDirectory, 'translation-cache.json');
  const chatActionsEnvironment = {
    ...process.env,
    alfred_workflow_data: dataDirectory,
    alfred_workflow_cache: cacheDirectory,
  };
  const executeChatAction = (actionName) => execFileSync(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', join(workflowDirectory, 'chat-actions'), actionName],
    { encoding: 'utf8', env: chatActionsEnvironment },
  ).trim();

  try {
    mkdirSync(dataDirectory, { recursive: true });
    mkdirSync(cacheDirectory, { recursive: true });
    const currentMessages = '[{"role":"user","content":"Hello"}]';
    writeFileSync(currentChatPath, currentMessages, 'utf8');

    assert.equal(executeChatAction('new'), 'Started a new chat');
    assert.equal(readFileSync(currentChatPath, 'utf8'), '[]');
    const archivedChatNames = readdirSync(archiveDirectory);
    assert.equal(archivedChatNames.length, 1);
    assert.equal(readFileSync(join(archiveDirectory, archivedChatNames[0]), 'utf8'), currentMessages);

    writeFileSync(currentChatPath, '{damaged', 'utf8');
    assert.equal(executeChatAction('new'), 'Started a new chat');
    assert.equal(readFileSync(currentChatPath, 'utf8'), '[]');
    assert.equal(readdirSync(archiveDirectory).length, 1);

    writeFileSync(join(cacheDirectory, 'chat-stream.txt'), 'data: partial', 'utf8');
    writeFileSync(join(cacheDirectory, 'chat-stream.pid'), 'not-a-process', 'utf8');
    writeFileSync(translationCachePath, '{"translatedText":"keep"}', 'utf8');
    assert.equal(executeChatAction('clear-all'), 'Cleared all chat history');
    assert.equal(existsSync(archiveDirectory), false);
    assert.equal(existsSync(join(cacheDirectory, 'chat-stream.txt')), false);
    assert.equal(existsSync(join(cacheDirectory, 'chat-stream.pid')), false);
    assert.equal(readFileSync(translationCachePath, 'utf8'), '{"translatedText":"keep"}');

    assert.equal(executeChatAction('clear-all'), 'Cleared all chat history');
    assert.equal(readFileSync(currentChatPath, 'utf8'), '[]');
    assert.equal(readFileSync(translationCachePath, 'utf8'), '{"translatedText":"keep"}');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('generated translation entry reports missing configuration before calling an API', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const output = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', join(workflowDirectory, 'translate'), '你好'], { encoding: 'utf8' });
  const result = JSON.parse(output);

  assert.equal(result.items[0].valid, false);
  assert.match(result.items[0].title, /Configuration error/);
});

test('generated translation entry supports host-only compatible endpoints and automatic direction', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const scriptText = readFileSync(join(workflowDirectory, 'translate'), 'utf8');

  assert.match(scriptText, /\/v1\/chat\/completions/);
  assert.match(scriptText, /CHINESE_TARGET_LANGUAGE/);
  assert.match(scriptText, /OTHER_TARGET_LANGUAGE/);
});

test('generated long-translation Text View receives the complete result as Object Input', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const objectsJson = execFileSync('/usr/bin/plutil', ['-extract', 'objects', 'json', '-o', '-', join(workflowDirectory, 'info.plist')], { encoding: 'utf8' });
  const connectionsJson = execFileSync('/usr/bin/plutil', ['-extract', 'connections', 'json', '-o', '-', join(workflowDirectory, 'info.plist')], { encoding: 'utf8' });
  const workflowObjects = JSON.parse(objectsJson);
  const workflowConnections = JSON.parse(connectionsJson);
  const kindCondition = workflowObjects.find((workflowObject) => workflowObject.uid === 'TRANSLATION_KIND_CONDITION');
  const textView = workflowObjects.find((workflowObject) => workflowObject.uid === 'TRANSLATION_TEXT_VIEW');
  const translationScriptText = readFileSync(join(workflowDirectory, 'translate'), 'utf8');

  assert.equal(kindCondition.type, 'alfred.workflow.utility.conditional');
  assert.equal(kindCondition.config.conditions[0].inputstring, '{var:translation_kind}');
  assert.equal(kindCondition.config.conditions[0].matchstring, 'long');
  assert.equal(textView.type, 'alfred.workflow.userinterface.text');
  assert.equal(textView.config.inputtype, 0);
  assert.equal(Object.hasOwn(textView.config, 'inputfile'), false);
  assert.equal(Object.hasOwn(textView.config, 'scriptinput'), false);
  assert.match(translationScriptText, /translation_kind/);
  assert.equal(workflowConnections.TRANSLATION_SCRIPT_FILTER[0].destinationuid, 'TRANSLATION_KIND_CONDITION');
  assert.equal(workflowConnections.TRANSLATION_KIND_CONDITION.some((connection) => connection.destinationuid === 'TRANSLATION_TEXT_VIEW'), true);
  assert.deepEqual(workflowConnections.TRANSLATION_TEXT_VIEW, [{
    destinationuid: 'TRANSLATION_COPY_TO_CLIPBOARD',
    modifiers: 0,
    modifiersubtext: '',
    vitoclose: false,
  }]);
});

test('generated translation entry returns Alfred JSON when curl fails', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const output = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', join(workflowDirectory, 'translate'), 'test'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENAI_BASE_URL: 'http://127.0.0.1:9',
      TRANSLATION_MODEL: 'test-model',
      REQUEST_TIMEOUT_SECONDS: '1',
    },
  });
  const result = JSON.parse(output);

  assert.equal(result.items[0].valid, false);
  assert.match(result.items[0].title, /Translation error/);
});

test('generated chat entry validates configuration and contains compatible request wiring', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const output = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', join(workflowDirectory, 'chat'), 'Hello'], { encoding: 'utf8' });
  const result = JSON.parse(output);
  const scriptText = readFileSync(join(workflowDirectory, 'chat'), 'utf8');

  assert.match(result.response, /Missing CHAT_MODEL/);
  assert.match(scriptText, /\/v1\/chat\/completions/);
  assert.match(scriptText, /OPENAI_API_KEY/);
  assert.match(scriptText, /CHAT_MODEL/);
});

test('generated chat entry streams SSE through Alfred cache and Text View reruns', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const scriptText = readFileSync(join(workflowDirectory, 'chat'), 'utf8');

  assert.match(scriptText, /stream: true/);
  assert.match(scriptText, /--no-buffer/);
  assert.match(scriptText, /alfred_workflow_cache/);
  assert.match(scriptText, /rerun: 0\.1/);
  assert.match(scriptText, /replacelast/);
  assert.match(scriptText, /const outputPipe = \$\.NSPipe\.pipe/);
  assert.match(scriptText, /requestTask\.standardOutput = outputPipe/);
  assert.doesNotMatch(scriptText, /readDataToEndOfFile/);
});

test('generated chat entry returns before delayed SSE completion', { timeout: 5000 }, async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'alfred-translation-stream-return-'));
  const dataDirectory = join(temporaryRoot, 'data');
  const cacheDirectory = join(temporaryRoot, 'cache');
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(cacheDirectory, { recursive: true });

  const delayedStreamServer = createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    response.flushHeaders();
    setTimeout(() => {
      response.write('data: {"choices":[{"delta":{"content":"finished"},"finish_reason":"stop"}]}\n\n');
      response.end('data: [DONE]\n\n');
    }, 1200);
  });
  delayedStreamServer.listen(0, '127.0.0.1');
  await once(delayedStreamServer, 'listening');
  const serverAddress = delayedStreamServer.address();
  const chatProcess = spawn(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', join(workflowDirectory, 'chat'), 'Hello'],
    {
      env: {
        ...process.env,
        OPENAI_BASE_URL: `http://127.0.0.1:${serverAddress.port}`,
        OPENAI_API_KEY: '',
        CHAT_MODEL: 'test-model',
        REQUEST_TIMEOUT_SECONDS: '5',
        MAX_CONTEXT_MESSAGES: '20',
        alfred_workflow_data: dataDirectory,
        alfred_workflow_cache: cacheDirectory,
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  let standardOutput = '';
  chatProcess.stdout.setEncoding('utf8');
  chatProcess.stdout.on('data', (outputChunk) => {
    standardOutput += outputChunk;
  });

  try {
    const processClosedEarly = await Promise.race([
      once(chatProcess, 'close').then(() => true),
      delay(500).then(() => false),
    ]);
    assert.equal(processClosedEarly, true, 'workflow/chat waited for the delayed curl stream to finish');
    const initialResult = JSON.parse(standardOutput);
    assert.equal(initialResult.rerun, 0.1);
    assert.equal(initialResult.variables.streaming_now, true);
    assert.equal(initialResult.variables.stream_marker, true);
  } finally {
    if (chatProcess.exitCode === null) chatProcess.kill('SIGTERM');
    delayedStreamServer.closeAllConnections();
    await new Promise((resolve) => delayedStreamServer.close(resolve));
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('package produces an Alfred workflow archive with only import artifacts', () => {
  execFileSync('/usr/bin/make', ['alfredworkflow'], { cwd: projectRoot, stdio: 'pipe' });
  const archivePath = join(projectRoot, 'dist', 'AlfredAICompanion.alfredworkflow');
  const archiveListing = execFileSync('/usr/bin/unzip', ['-Z1', archivePath], { encoding: 'utf8' }).trim().split('\n').sort();

  assert.deepEqual(archiveListing, ['chat', 'chat-actions', 'icon.png', 'info.plist', 'translate', 'translate-view']);
});

test('package and generated Workflow expose version 0.4.0', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const packageMetadata = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const workflowVersion = execFileSync(
    '/usr/bin/plutil',
    ['-extract', 'version', 'raw', '-o', '-', join(workflowDirectory, 'info.plist')],
    { encoding: 'utf8' },
  ).trim();

  assert.equal(packageMetadata.version, '0.4.0');
  assert.equal(workflowVersion, '0.4.0');
});
