# Alfred OpenAI Translation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可导入 Alfred 5 的零运行时依赖 Workflow，同时提供 OpenAI-compatible 流式聊天和自动中英翻译。

**Architecture:** 源码按纯逻辑、JXA 运行时适配、聊天和翻译入口拆分；构建脚本按固定顺序拼接为 Alfred 可执行 JXA 文件。聊天通过 `curl` 将 SSE 写入缓存并由 Text View rerun 增量读取，翻译通过非流式请求返回 Script Filter JSON。

**Tech Stack:** JavaScript、JXA、macOS Foundation、`curl`、Node.js 22 内置测试运行器、Alfred 5 Workflow、Make、`plutil`、Zip。

## Global Constraints

- 最终用户运行时仅允许 macOS 自带 JXA、Foundation 和 `/usr/bin/curl`。
- 最终包不得依赖 Node.js、Python、Homebrew 或 `jq`。
- 首版仅支持 OpenAI-compatible `POST /v1/chat/completions`。
- 聊天与翻译共用 Base URL、API Key，分别使用 `CHAT_MODEL` 和 `TRANSLATION_MODEL`。
- 图片生成、Responses API、模型动态获取、Azure 专有认证和多服务配置不在首版范围。
- API Key 不得进入仓库、日志、会话、缓存或打包产物。
- 所有新建代码文件必须标注 `@author xiaopeng.fxp` 和 `@date 2026-07-13`。
- 调用私有方法使用 `this.` 前缀；命名不得使用无业务含义的 `map`、`list`、`dto`、`vo`、`do`、`a`、`b`、`c`。
- 派生自 `alfredapp/openai-workflow` 的内容必须保留 BSD-3-Clause 许可和来源说明。

## File Map

```text
package.json                              开发期命令，不进入 Workflow
Makefile                                  test/build/package/verify 统一入口
LICENSE                                   BSD-3-Clause 项目许可
README.md                                 安装、配置、使用和来源说明
scripts/build.mjs                         按入口清单拼接 JXA 脚本
scripts/generate-workflow.mjs             生成 Alfred info.plist
scripts/package.mjs                       生成 .alfredworkflow
scripts/verify.mjs                        验证 plist、引用、权限和包内容
src/core/config.js                        配置校验与 Base URL 规范化
src/core/errors.js                        API 错误解析与安全截断
src/core/sse.js                           Chat Completions SSE 解析
src/core/alfred-json.js                   Script Filter/Text View JSON 构造
src/runtime/jxa-foundation.js             环境变量、文件和 NSTask 适配
src/runtime/jxa-curl.js                   curl 请求启动、中断和状态读取
src/chat/history.js                       当前会话、归档和 Markdown 渲染
src/chat/stream.js                        流状态机
src/chat/entry.js                         Text View 入口
src/chat/actions.js                       新会话、复制、中断和历史装载动作
src/chat/history-entry.js                 历史会话 Script Filter 入口
src/translation/direction.js              中文检测与目标语言选择
src/translation/prompt.js                 翻译消息构造
src/translation/result.js                 长短译文分类及候选项
src/translation/cache.js                  最近一次翻译缓存
src/translation/entry.js                  Script Filter 与长文 Text View 入口
workflow/info.plist                       生成后的 Alfred Workflow 定义
workflow/chat                             生成后的聊天 JXA 入口
workflow/chat-actions                     生成后的聊天动作 JXA 入口
workflow/chat-history                     生成后的历史会话 Script Filter 入口
workflow/translate                        生成后的翻译 Script Filter 入口
workflow/translate-view                   生成后的长译文 Text View 入口
workflow/icon.png                         Workflow 图标
tests/core/*.test.js                      核心纯逻辑单元测试
tests/chat/*.test.js                      会话与流状态测试
tests/translation/*.test.js               翻译领域测试
tests/contract/fake-openai-server.mjs      本地 OpenAI-compatible 模拟服务
tests/contract/openai-client.test.js       请求契约测试
tests/workflow/structure.test.js           Workflow 结构测试
```

---

### Task 1: Core Configuration Contract

**Files:**
- Create: `package.json`
- Create: `src/core/config.js`
- Test: `tests/core/config.test.js`

**Interfaces:**
- Produces: `normalizeChatCompletionsUrl(rawBaseUrl: string): string`
- Produces: `loadWorkflowConfig(readEnvironment: (name: string) => string | undefined): WorkflowConfig`
- `WorkflowConfig` keys: `apiEndpoint`, `apiKey`, `chatModel`, `translationModel`, `chatSystemPrompt`, `chineseTargetLanguage`, `otherTargetLanguage`, `maxContextMessages`, `requestTimeoutSeconds`, `keepChatHistory`

- [ ] **Step 1: Add the Node test harness and failing configuration tests**

```json
{
  "name": "alfred-openai-translation",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test tests/**/*.test.js",
    "build": "node scripts/build.mjs && node scripts/generate-workflow.mjs",
    "package": "node scripts/package.mjs",
    "verify": "node scripts/verify.mjs"
  }
}
```

Create `tests/core/config.test.js` with tests for host-only, `/v1`, full endpoint, invalid protocol, missing models, empty API Key, numeric bounds and checkbox parsing:

```javascript
/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeChatCompletionsUrl,
  loadWorkflowConfig,
} = require('../../src/core/config');

test('normalizes compatible endpoint forms', () => {
  assert.equal(normalizeChatCompletionsUrl('https://api.example.com'), 'https://api.example.com/v1/chat/completions');
  assert.equal(normalizeChatCompletionsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
  assert.equal(normalizeChatCompletionsUrl('http://127.0.0.1:11434/v1/chat/completions'), 'http://127.0.0.1:11434/v1/chat/completions');
});

test('rejects non-http endpoints', () => {
  assert.throws(() => normalizeChatCompletionsUrl('file:///tmp/api'), /http or https/);
});

test('loads separate chat and translation models', () => {
  const values = {
    OPENAI_BASE_URL: 'https://api.example.com/v1',
    OPENAI_API_KEY: '',
    CHAT_MODEL: 'chat-model',
    TRANSLATION_MODEL: 'translation-model',
    MAX_CONTEXT_MESSAGES: '20',
    REQUEST_TIMEOUT_SECONDS: '30',
    KEEP_CHAT_HISTORY: '1',
  };
  const config = loadWorkflowConfig((name) => values[name]);
  assert.equal(config.chatModel, 'chat-model');
  assert.equal(config.translationModel, 'translation-model');
  assert.equal(config.apiKey, '');
  assert.equal(config.keepChatHistory, true);
});

test('reports every missing required model', () => {
  assert.throws(
    () => loadWorkflowConfig((name) => ({ OPENAI_BASE_URL: 'https://api.example.com/v1' })[name]),
    /CHAT_MODEL, TRANSLATION_MODEL/,
  );
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `npm test -- tests/core/config.test.js`

Expected: FAIL with `Cannot find module '../../src/core/config'`.

- [ ] **Step 3: Implement the minimal configuration module**

Create `src/core/config.js` with named constants for defaults, URL normalization that distinguishes host-only from path URLs, required-model aggregation, integer bounds `2..50` and `5..120`, and checkbox parsing for `1`, `true`, and `yes`.

```javascript
/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CHINESE_TARGET = 'English';
const DEFAULT_OTHER_TARGET = 'Simplified Chinese';

function normalizeChatCompletionsUrl(rawBaseUrl) {
  const trimmedUrl = (rawBaseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmedUrl)) throw new Error('OPENAI_BASE_URL must use http or https');
  if (/\/chat\/completions$/i.test(trimmedUrl)) return trimmedUrl;
  const schemeBoundary = trimmedUrl.indexOf('://') + 3;
  const pathBoundary = trimmedUrl.indexOf('/', schemeBoundary);
  const hasServicePath = pathBoundary >= 0 && trimmedUrl.slice(pathBoundary) !== '/';
  return !hasServicePath
    ? `${trimmedUrl}/v1/chat/completions`
    : `${trimmedUrl}/chat/completions`;
}

function parseInteger(value, fallback, minimum, maximum, variableName) {
  const parsedValue = Number.parseInt(value || String(fallback), 10);
  if (!Number.isInteger(parsedValue) || parsedValue < minimum || parsedValue > maximum) {
    throw new Error(`${variableName} must be between ${minimum} and ${maximum}`);
  }
  return parsedValue;
}

function parseCheckbox(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '1').toLowerCase());
}

function loadWorkflowConfig(readEnvironment) {
  const chatModel = (readEnvironment('CHAT_MODEL') || '').trim();
  const translationModel = (readEnvironment('TRANSLATION_MODEL') || '').trim();
  const missingVariables = [
    !chatModel && 'CHAT_MODEL',
    !translationModel && 'TRANSLATION_MODEL',
  ].filter(Boolean);
  if (missingVariables.length) throw new Error(`Missing configuration: ${missingVariables.join(', ')}`);

  return {
    apiEndpoint: normalizeChatCompletionsUrl(readEnvironment('OPENAI_BASE_URL')),
    apiKey: readEnvironment('OPENAI_API_KEY') || '',
    chatModel,
    translationModel,
    chatSystemPrompt: readEnvironment('CHAT_SYSTEM_PROMPT') || '',
    chineseTargetLanguage: readEnvironment('CHINESE_TARGET_LANGUAGE') || DEFAULT_CHINESE_TARGET,
    otherTargetLanguage: readEnvironment('OTHER_TARGET_LANGUAGE') || DEFAULT_OTHER_TARGET,
    maxContextMessages: parseInteger(readEnvironment('MAX_CONTEXT_MESSAGES'), 20, 2, 50, 'MAX_CONTEXT_MESSAGES'),
    requestTimeoutSeconds: parseInteger(readEnvironment('REQUEST_TIMEOUT_SECONDS'), 30, 5, 120, 'REQUEST_TIMEOUT_SECONDS'),
    keepChatHistory: parseCheckbox(readEnvironment('KEEP_CHAT_HISTORY')),
  };
}

if (typeof module !== 'undefined') module.exports = { normalizeChatCompletionsUrl, loadWorkflowConfig };
```

- [ ] **Step 4: Run configuration tests**

Run: `npm test -- tests/core/config.test.js`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the configuration contract**

```bash
git add package.json src/core/config.js tests/core/config.test.js
git commit -m "feat: add workflow configuration contract"
```

---

### Task 2: Translation Domain Logic

**Files:**
- Create: `src/translation/direction.js`
- Create: `src/translation/prompt.js`
- Create: `src/translation/result.js`
- Test: `tests/translation/domain.test.js`

**Interfaces:**
- Consumes: `WorkflowConfig.chineseTargetLanguage`, `WorkflowConfig.otherTargetLanguage`
- Produces: `selectTranslationDirection(sourceText, config): { sourceKind, targetLanguage }`
- Produces: `buildTranslationMessages(sourceText, targetLanguage): Array<{role, content}>`
- Produces: `classifyTranslationResult(translatedText): { kind: 'short' | 'long', text, preview }`

- [ ] **Step 1: Write failing translation-domain tests**

```javascript
/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTranslationDirection } = require('../../src/translation/direction');
const { buildTranslationMessages } = require('../../src/translation/prompt');
const { classifyTranslationResult } = require('../../src/translation/result');

const config = { chineseTargetLanguage: 'English', otherTargetLanguage: 'Simplified Chinese' };

test('routes Han text to the configured Chinese target', () => {
  assert.deepEqual(selectTranslationDirection('你好 Alfred', config), { sourceKind: 'han', targetLanguage: 'English' });
  assert.deepEqual(selectTranslationDirection('hello Alfred', config), { sourceKind: 'other', targetLanguage: 'Simplified Chinese' });
});

test('builds a format-preserving translation request', () => {
  const messages = buildTranslationMessages('Hello {name}\n`code`', 'Simplified Chinese');
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /only the translation/i);
  assert.match(messages[0].content, /placeholders/i);
  assert.equal(messages[1].content, 'Hello {name}\n`code`');
});

test('classifies the exact length and line boundaries', () => {
  assert.equal(classifyTranslationResult('x'.repeat(240)).kind, 'short');
  assert.equal(classifyTranslationResult('x'.repeat(241)).kind, 'long');
  assert.equal(classifyTranslationResult('one\ntwo\nthree').kind, 'short');
  assert.equal(classifyTranslationResult('one\ntwo\nthree\nfour').kind, 'long');
});
```

- [ ] **Step 2: Run tests and verify missing-module failures**

Run: `npm test -- tests/translation/domain.test.js`

Expected: FAIL with the first missing translation module.

- [ ] **Step 3: Implement direction, prompt, and result classification**

Use this exact Han range and trim only the model's outer whitespace:

```javascript
const HAN_CHARACTER_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;

function selectTranslationDirection(sourceText, config) {
  const sourceKind = HAN_CHARACTER_PATTERN.test(sourceText) ? 'han' : 'other';
  return {
    sourceKind,
    targetLanguage: sourceKind === 'han' ? config.chineseTargetLanguage : config.otherTargetLanguage,
  };
}
```

```javascript
function buildTranslationMessages(sourceText, targetLanguage) {
  return [
    {
      role: 'system',
      content: `Translate the user content into ${targetLanguage}. Return only the translation. Preserve paragraphs, code, URLs, and placeholders. Do not add quotes, explanations, or Markdown fences.`,
    },
    { role: 'user', content: sourceText },
  ];
}
```

```javascript
function classifyTranslationResult(translatedText) {
  const text = translatedText.trim();
  const lineCount = text === '' ? 0 : text.split('\n').length;
  const kind = text.length <= 240 && lineCount <= 3 ? 'short' : 'long';
  return { kind, text, preview: kind === 'short' ? text : `${text.slice(0, 237)}…` };
}
```

Each file must include the required author/date header and guarded `module.exports`.

- [ ] **Step 4: Run translation-domain tests**

Run: `npm test -- tests/translation/domain.test.js`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit translation-domain behavior**

```bash
git add src/translation tests/translation/domain.test.js
git commit -m "feat: add translation domain rules"
```

---

### Task 3: API Errors, Alfred JSON, and SSE Parsing

**Files:**
- Create: `src/core/errors.js`
- Create: `src/core/sse.js`
- Create: `src/core/alfred-json.js`
- Test: `tests/core/protocol.test.js`

**Interfaces:**
- Produces: `extractApiError(statusCode, responseBody): ErrorSummary`
- Produces: `parseChatCompletionStream(streamText): { content, finishReason, done }`
- Produces: `createErrorItem(title, subtitle): string`
- Produces: `createTranslationItem(result, metadata): string`

- [ ] **Step 1: Write failing protocol tests**

Cover standard `error.message`, non-JSON 500 bodies truncated to 300 characters, normal SSE, `[DONE]`, malformed partial lines, and short/long Alfred modifiers.

```javascript
test('extracts standard OpenAI errors without leaking headers', () => {
  assert.deepEqual(extractApiError(401, '{"error":{"message":"Invalid key"}}'), {
    statusCode: 401,
    message: 'Invalid key',
  });
});

test('parses valid SSE while ignoring an incomplete trailing line', () => {
  const streamText = [
    'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}',
    'data: [DONE]',
    'data: {"choices":',
  ].join('\n\n');
  assert.deepEqual(parseChatCompletionStream(streamText), { content: '你好', finishReason: 'stop', done: true });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/core/protocol.test.js`

Expected: FAIL because protocol modules do not exist.

- [ ] **Step 3: Implement protocol helpers**

`parseChatCompletionStream` must split on line boundaries, process only `data:` records, mark `[DONE]`, ignore JSON parse failures, and concatenate `choices[0].delta.content`. `extractApiError` must never include request headers and must return `HTTP <status>: <body>` for non-standard responses. `createTranslationItem` must emit:

```javascript
{
  items: [{
    title: result.preview,
    subtitle: `${metadata.sourceKind} → ${metadata.targetLanguage} · ${metadata.model}`,
    arg: result.text,
    valid: true,
    variables: { translation_kind: result.kind },
    mods: {
      cmd: { arg: result.text, subtitle: result.kind === 'short' ? 'Copy and paste' : 'Copy full translation' },
    },
  }],
}
```

- [ ] **Step 4: Run protocol tests**

Run: `npm test -- tests/core/protocol.test.js`

Expected: all protocol tests PASS.

- [ ] **Step 5: Commit protocol helpers**

```bash
git add src/core tests/core/protocol.test.js
git commit -m "feat: add compatible API protocol helpers"
```

---

### Task 4: Chat History and Stream State

**Files:**
- Create: `src/chat/history.js`
- Create: `src/chat/stream.js`
- Test: `tests/chat/history.test.js`
- Test: `tests/chat/stream.test.js`

**Interfaces:**
- Produces: `createChatHistory(fileSystem, paths, clock, createIdentifier): ChatHistory`
- `ChatHistory` methods: `loadCurrent()`, `append(message)`, `archiveCurrent()`, `replaceCurrent(messages)`, `renderMarkdown(ignoreInterrupted)`
- Produces: `evaluateStreamState({ streamText, modifiedAt, now, timeoutSeconds }): StreamDecision`
- `StreamDecision.action`: `wait | continue | complete | stalled | error`

- [ ] **Step 1: Write failing history tests with an in-memory file system**

Tests must prove initial `[]`, atomic writes, message append, timestamped archive, corrupted-file rename, and Markdown rendering for an interrupted final user message. The test file system exposes `exists`, `readText`, `writeTextAtomic`, `move`, `modifiedAt`, and `ensureDirectory`.

- [ ] **Step 2: Run history tests and verify failure**

Run: `npm test -- tests/chat/history.test.js`

Expected: FAIL with missing `src/chat/history.js`.

- [ ] **Step 3: Implement ChatHistory with dependency injection**

Use `this.` for every private helper invocation. Archive names must be `<ISO timestamp with punctuation replaced>-<identifier>.json`. On invalid JSON, move the file to `current.corrupt-<timestamp>.json`, create `[]`, and return `{ messages: [], recoveryNotice: 'Recovered a damaged chat history' }`.

- [ ] **Step 4: Write failing stream-state tests**

Cover empty new stream, unfinished content, finished content, stalled partial content, and standard API error JSON.

- [ ] **Step 5: Implement the stream state evaluator**

Use `parseChatCompletionStream` and `extractApiError`. A stream is stalled only when `now - modifiedAt > timeoutSeconds * 1000`. Preserve partial content in `stalled` decisions.

- [ ] **Step 6: Run chat tests**

Run: `npm test -- tests/chat/*.test.js`

Expected: all chat tests PASS.

- [ ] **Step 7: Commit chat state behavior**

```bash
git add src/chat tests/chat
git commit -m "feat: add chat history and stream state"
```

---

### Task 5: JXA Runtime and OpenAI-Compatible Request Execution

**Files:**
- Create: `src/runtime/jxa-foundation.js`
- Create: `src/runtime/jxa-curl.js`
- Create: `src/openai/request.js`
- Test: `tests/contract/fake-openai-server.mjs`
- Test: `tests/contract/openai-client.test.js`

**Interfaces:**
- Produces: global `RuntimeEnvironment` with `readEnvironment`, `fileSystem`, `startTask`, `terminateProcess`
- Produces: `createChatCompletionRequest(config, model, messages, stream): RequestSpec`
- Produces: `startCurlRequest(requestSpec, outputPath, processPath, timeoutSeconds): number`
- `RequestSpec`: `{ endpoint, headers: string[], body: string }`

- [ ] **Step 1: Write failing request-shape and contract tests**

The fake server must bind to `127.0.0.1` on an ephemeral port and expose:

- `/v1/chat/completions`: return JSON when `stream=false`.
- `/v1/chat/completions`: return two SSE chunks plus `[DONE]` when `stream=true`.
- `/errors/401`, `/errors/429`, `/errors/500`.
- `/stall`: write one SSE chunk and leave the connection open until test cleanup.

Assert exact model separation and that an empty API Key omits Authorization.

- [ ] **Step 2: Run contract tests and verify failure**

Run: `npm test -- tests/contract/openai-client.test.js`

Expected: FAIL because request execution modules do not exist.

- [ ] **Step 3: Implement pure request construction**

```javascript
function createChatCompletionRequest(config, model, messages, stream) {
  const headers = ['Content-Type: application/json'];
  if (config.apiKey) headers.push(`Authorization: Bearer ${config.apiKey}`);
  return {
    endpoint: config.apiEndpoint,
    headers,
    body: JSON.stringify({ model, messages, stream }),
  };
}
```

- [ ] **Step 4: Implement JXA Foundation and curl adapters**

`jxa-foundation.js` must wrap Foundation file APIs and atomic writes. `jxa-curl.js` must launch `/usr/bin/curl` through `NSTask` with an argument array containing `--silent`, `--show-error`, `--no-buffer`, `--connect-timeout`, repeated `--header`, `--data`, and `--output`. Save only the launched PID to `processPath`; never save headers or request bodies.

- [ ] **Step 5: Run contract tests**

Run: `npm test -- tests/contract/openai-client.test.js`

Expected: request-shape and local-server contract tests PASS.

- [ ] **Step 6: Commit runtime execution**

```bash
git add src/runtime src/openai tests/contract
git commit -m "feat: add OpenAI compatible request runtime"
```

---

### Task 6: Chat and Translation Executable Entries

**Files:**
- Create: `src/chat/entry.js`
- Create: `src/chat/actions.js`
- Create: `src/chat/history-entry.js`
- Create: `src/translation/cache.js`
- Create: `src/translation/entry.js`
- Test: `tests/chat/entry.test.js`
- Test: `tests/chat/actions.test.js`
- Test: `tests/translation/entry.test.js`

**Interfaces:**
- Produces: JXA `run(argv)` for `workflow/chat`
- Produces: JXA `run(argv)` for `workflow/chat-actions`
- Produces: JXA `run(argv)` for `workflow/chat-history`
- Produces: JXA `run(argv)` for `workflow/translate`
- Produces: JXA `run(argv)` for `workflow/translate-view`
- Translation cache shape: `{ identity, sourceText, translatedText, sourceKind, targetLanguage, model, createdAt }`

- [ ] **Step 1: Write failing chat-entry tests using fake runtime dependencies**

Cover empty query rendering, new user question append, correct `CHAT_MODEL`, last-N context, system Prompt insertion, stream resume, completed stream persistence, stalled stream cleanup, and explicit interrupt cleanup.

- [ ] **Step 2: Implement chat entry as a dependency-injected controller**

The exported test interface is `createChatController(dependencies)`. JXA `run(argv)` creates real dependencies and delegates to the controller. The controller returns Alfred Text View JSON containing only `response`, `rerun`, `footer`, `variables`, and `behaviour` keys accepted by Alfred.

- [ ] **Step 3: Write failing chat-action and history-entry tests**

Cover `new`, `copy-last`, `copy-all`, `interrupt`, `load-history`, empty archives, archive ordering, and removal of invalid archive records. Assert that `interrupt` terminates only the PID stored under `alfred_workflow_cache`, then removes the stream and PID files.

- [ ] **Step 4: Implement chat actions and history Script Filter**

Export `createChatActionController(dependencies)` with `execute(actionName, argument)` and `createHistoryEntryController(chatHistory)`. Action results must be plain strings suitable for Clipboard or Text View input. The history entry returns file-type Alfred items with first user question as title, last user question as subtitle, and archive path as `arg`.

- [ ] **Step 5: Write failing translation-entry tests**

Cover configuration error item, empty query item, cache hit without API call, correct `TRANSLATION_MODEL`, short result, long result, 401, malformed response, and long-view cache read.

- [ ] **Step 6: Implement translation cache and entry controllers**

Use `JSON.stringify([sourceText, targetLanguage, apiEndpoint, translationModel])` as the cache identity. `translate` performs a non-streaming request and writes the cache atomically. `translate-view` reads the cache and returns:

```javascript
JSON.stringify({
  response: cachedTranslation.translatedText,
  behaviour: { scroll: 'end' },
});
```

Short translation items set `translation_kind=short`; long items set `translation_kind=long`. Errors use `createErrorItem` and never throw raw stack traces into Alfred.

- [ ] **Step 7: Run entry tests**

Run: `npm test -- tests/chat/entry.test.js tests/chat/actions.test.js tests/translation/entry.test.js`

Expected: all controller tests PASS.

- [ ] **Step 8: Commit executable controllers**

```bash
git add src/chat src/translation/cache.js src/translation/entry.js tests/chat tests/translation/entry.test.js
git commit -m "feat: add chat and translation controllers"
```

---

### Task 7: Alfred Workflow Definition and Build Pipeline

**Files:**
- Create: `scripts/build.mjs`
- Create: `scripts/generate-workflow.mjs`
- Create: `scripts/package.mjs`
- Create: `scripts/verify.mjs`
- Create: `Makefile`
- Create: `workflow/icon.png`
- Generate: `workflow/chat`
- Generate: `workflow/chat-actions`
- Generate: `workflow/chat-history`
- Generate: `workflow/translate`
- Generate: `workflow/translate-view`
- Generate: `workflow/info.plist`
- Test: `tests/workflow/structure.test.js`

**Interfaces:**
- Consumes: all source entry files from Tasks 1-6
- Produces: `workflow/info.plist`, five executable JXA files, `dist/AlfredTranslation.alfredworkflow`

- [ ] **Step 1: Write the failing structure test**

The test must run `npm run build`, `plutil -lint workflow/info.plist`, verify all five scripts start with `#!/usr/bin/osascript -l JavaScript`, verify executable mode, and inspect plist JSON for:

- bundle ID `com.xiaopeng.fxp.alfredtranslation`
- keyword variables `CHAT_KEYWORD` and `TRANSLATION_KEYWORD`
- two Universal Actions: `Ask AI` and `Translate with AI`
- one chat Text View, one translation Script Filter, one translation Text View
- one chat-history Script Filter and nodes for new chat, copy last, copy all, interrupt, and history loading
- configuration variables from the design spec

- [ ] **Step 2: Run the structure test and verify failure**

Run: `npm test -- tests/workflow/structure.test.js`

Expected: FAIL because build scripts and Workflow files do not exist.

- [ ] **Step 3: Implement deterministic JXA concatenation**

`scripts/build.mjs` must contain five explicit ordered entry arrays and prepend:

```javascript
#!/usr/bin/osascript -l JavaScript
/**
 * Generated file. Source: src/
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
```

It must remove guarded `module.exports` lines from generated output, write atomically, and `chmod 755` each executable.

- [ ] **Step 4: Generate the Alfred plist from a checked-in JavaScript definition**

`scripts/generate-workflow.mjs` must write a temporary JSON plist and convert it using:

```javascript
spawnSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', 'workflow/info.plist', temporaryJsonPath], { stdio: 'inherit' });
```

The definition must include these stable node UIDs and connections:

```text
CHAT_KEYWORD_INPUT(default)        → CHAT_TEXT_VIEW
CHAT_KEYWORD_INPUT(cmd)            → CHAT_ACTION_NEW → CHAT_TEXT_VIEW
CHAT_KEYWORD_INPUT(alt)            → CHAT_HISTORY_SCRIPT_FILTER
ASK_AI_UNIVERSAL_ACTION            → CHAT_TEXT_VIEW
CHAT_TEXT_VIEW(default)            → CHAT_TEXT_VIEW
CHAT_TEXT_VIEW(cmd)                → CHAT_ACTION_NEW → CHAT_TEXT_VIEW
CHAT_TEXT_VIEW(alt)                → CHAT_ACTION_COPY_LAST → COPY_CHAT_OUTPUT
CHAT_TEXT_VIEW(ctrl)               → CHAT_ACTION_COPY_ALL → COPY_CHAT_OUTPUT
CHAT_TEXT_VIEW(shift)              → CHAT_ACTION_INTERRUPT
CHAT_HISTORY_SCRIPT_FILTER         → CHAT_ACTION_LOAD_HISTORY → CHAT_TEXT_VIEW
TRANSLATE_SCRIPT_FILTER(default)   → TRANSLATION_KIND_CONDITION
TRANSLATION_KIND_CONDITION(short)  → COPY_TRANSLATION
TRANSLATION_KIND_CONDITION(long)   → TRANSLATION_TEXT_VIEW
TRANSLATE_SCRIPT_FILTER(cmd)       → TRANSLATION_CMD_KIND_CONDITION
TRANSLATION_CMD_KIND_CONDITION(short) → PASTE_TRANSLATION
TRANSLATION_CMD_KIND_CONDITION(long)  → COPY_TRANSLATION
TRANSLATE_UNIVERSAL_ACTION         → TRANSLATE_SCRIPT_FILTER
```

Chat Text View config must use `inputfile: chat`, `inputtype: 1`, `scriptinput: 2`, `outputmode: 1`. Chat history must use `scriptfile: chat-history`. Chat actions must use `scriptfile: chat-actions` and an action-name argument variable. Translation Script Filter must use `scriptfile: translate`, external-script type `11`, queue mode `1`, and a 0.35-second delay. Translation Text View must use `inputfile: translate-view` and `outputmode: 0`. `COPY_TRANSLATION` uses Clipboard with `autopaste: false`; `PASTE_TRANSLATION` uses Clipboard with `autopaste: true`.

- [ ] **Step 5: Implement package and verification scripts**

`package.mjs` deletes and recreates `dist`, then runs `/usr/bin/zip -r -X ../dist/AlfredTranslation.alfredworkflow .` from `workflow`. `verify.mjs` must reject files containing `sk-`, `Authorization: Bearer` followed by a non-placeholder value, `node_modules`, `.DS_Store`, cache JSON, or test fixtures.

Create a neutral 512×512 PNG icon with an abstract speech bubble and bidirectional translation arrows, without OpenAI or Alfred trademarks. Save it as `workflow/icon.png`, verify it with `sips -g pixelWidth -g pixelHeight workflow/icon.png`, and require both dimensions to equal `512` in `verify.mjs`.

Create the Makefile:

```makefile
# @author xiaopeng.fxp
# @date 2026-07-13
.PHONY: test build package verify

test:
	npm test

build:
	npm run build

package: build
	npm run package

verify: test package
	npm run verify
```

- [ ] **Step 6: Run Workflow structure tests**

Run: `npm test -- tests/workflow/structure.test.js`

Expected: Workflow build succeeds and every structure assertion PASS.

- [ ] **Step 7: Commit the Workflow build pipeline**

```bash
git add scripts Makefile workflow tests/workflow package.json
git commit -m "build: generate Alfred workflow package"
```

---

### Task 8: Documentation, License, and Full Verification

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Modify: `docs/superpowers/specs/2026-07-13-alfred-openai-translation-design.md`
- Create: `.gitignore`

**Interfaces:**
- Produces: installable `dist/AlfredTranslation.alfredworkflow`
- Produces: user-facing configuration recipes for OpenAI, OpenRouter, Ollama, and LM Studio

- [ ] **Step 1: Add documentation assertions**

Extend `tests/workflow/structure.test.js` to assert README contains all 12 configuration names, the four supported provider examples, the official reference URL, and a security warning that Alfred user configuration stores the API Key locally.

- [ ] **Step 2: Run the documentation assertion and verify failure**

Run: `npm test -- tests/workflow/structure.test.js`

Expected: FAIL because README and LICENSE are missing.

- [ ] **Step 3: Write README, license, and ignore rules**

README sections must be: Features, Requirements, Install, Configuration, Chat, Translation, Universal Actions, Provider Examples, Security, Development, Attribution, License. Provider URLs must be:

```text
OpenAI:    https://api.openai.com/v1
OpenRouter:https://openrouter.ai/api/v1
Ollama:    http://127.0.0.1:11434/v1
LM Studio: http://127.0.0.1:1234/v1
```

Copy the BSD-3-Clause text from the official repository's `LICENSE`, preserve its notice for adapted portions, and add the project copyright line without removing the upstream notice.

`.gitignore` must contain:

```gitignore
node_modules/
dist/
.DS_Store
*.alfredworkflow
coverage/
```

Update the design document only if implementation revealed a necessary clarification; do not change confirmed behavior silently.

- [ ] **Step 4: Run the complete test and packaging pipeline**

Run: `make verify`

Expected:

```text
all node tests pass
workflow/info.plist: OK
dist/AlfredTranslation.alfredworkflow created
verification passed
```

- [ ] **Step 5: Inspect the final package contents and git diff**

Run: `unzip -l dist/AlfredTranslation.alfredworkflow`

Expected: only `info.plist`, `chat`, `chat-actions`, `chat-history`, `translate`, `translate-view`, and `icon.png`.

Run: `git status --short && git diff --check`

Expected: only intended uncommitted final-task files before commit; `git diff --check` prints nothing.

- [ ] **Step 6: Commit documentation and verified artifact sources**

```bash
git add README.md LICENSE .gitignore docs workflow scripts src tests Makefile package.json
git commit -m "docs: document Alfred translation workflow"
```

- [ ] **Step 7: Record final verification evidence**

Run: `make verify && git status --short`

Expected: verification passes and Git working tree is clean. Do not claim Alfred GUI acceptance unless the package has also been imported and exercised in Alfred 5; report automated verification and GUI verification separately.
