/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { existsSync, statSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const projectRoot = join(__dirname, '../..');
const workflowDirectory = join(projectRoot, 'workflow');

test('build generates an importable Alfred Workflow skeleton', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  execFileSync('/usr/bin/plutil', ['-lint', join(workflowDirectory, 'info.plist')], { stdio: 'pipe' });

  for (const scriptName of ['chat', 'translate', 'translate-view']) {
    const scriptPath = join(workflowDirectory, scriptName);
    assert.equal(existsSync(scriptPath), true);
    assert.match(readFileSync(scriptPath, 'utf8'), /^#!\/usr\/bin\/osascript -l JavaScript/);
    assert.notEqual(statSync(scriptPath).mode & 0o111, 0);
  }

  const plistText = readFileSync(join(workflowDirectory, 'info.plist'), 'utf8');
  const objectsJson = execFileSync('/usr/bin/plutil', ['-extract', 'objects', 'json', '-o', '-', join(workflowDirectory, 'info.plist')], { encoding: 'utf8' });
  assert.equal(Array.isArray(JSON.parse(objectsJson)), true);
  assert.match(plistText, /com\.xiaopeng\.fxp\.alfredtranslation/);
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
});

test('README documents streaming chat as available', () => {
  const readmeText = readFileSync(join(projectRoot, 'README.md'), 'utf8');

  assert.match(readmeText, /SSE 流式/);
  assert.doesNotMatch(readmeText, /流式聊天与会话历史仍在开发中/);
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

test('generated workflow routes long translations through Text View', () => {
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
  assert.equal(textView.config.inputfile, 'translate-view');
  assert.match(translationScriptText, /translation_kind/);
  assert.match(translationScriptText, /translation-cache\.json/);
  assert.equal(workflowConnections.TRANSLATION_SCRIPT_FILTER[0].destinationuid, 'TRANSLATION_KIND_CONDITION');
  assert.equal(workflowConnections.TRANSLATION_KIND_CONDITION.some((connection) => connection.destinationuid === 'TRANSLATION_TEXT_VIEW'), true);
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
  assert.doesNotMatch(scriptText, /readDataToEndOfFile/);
});

test('package produces an Alfred workflow archive with only import artifacts', () => {
  execFileSync(process.execPath, ['scripts/package.mjs'], { cwd: projectRoot, stdio: 'pipe' });
  const archivePath = join(projectRoot, 'dist', 'AlfredTranslation.alfredworkflow');
  const archiveListing = execFileSync('/usr/bin/unzip', ['-Z1', archivePath], { encoding: 'utf8' }).trim().split('\n').sort();

  assert.deepEqual(archiveListing, ['chat', 'icon.png', 'info.plist', 'translate', 'translate-view']);
});
