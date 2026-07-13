# Ask AI Chat History Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Ask AI 增加 `⌘↩` 新会话和经 `ai-clear` 二次确认后清空全部聊天历史的能力。

**Architecture:** 纯逻辑放入依赖注入的 `ChatActionController`，负责归档、重置、删除和流进程终止；构建脚本生成独立 `chat-actions` JXA 入口，并通过 Alfred 原生 Script Filter、Run Script 与 Notification 节点编排交互。聊天 Text View 与翻译缓存不承担历史维护职责。

**Tech Stack:** JavaScript、Node.js 内置测试运行器、JXA、macOS Foundation、Alfred 5 Workflow、`plutil`、Zip。

## Global Constraints

- 最终用户运行时仅使用 macOS 自带 JXA 和 Foundation。
- `new` 归档非空且合法的当前会话；空会话不创建归档。
- `clear-all` 删除当前会话、聊天归档、聊天流和 PID，并重新创建合法的 `[]`。
- 翻译缓存不得被删除。
- 只终止 PID 文件中的正整数进程。
- 文件不存在或目录为空时保持幂等。
- 所有新建代码文件包含 `@author xiaopeng.fxp` 和 `@date 2026-07-13`。

## File Map

```text
src/chat/actions.js                         会话维护纯逻辑控制器
tests/chat/actions.test.js                  新会话、清空全部和 PID 安全测试
scripts/build.mjs                           生成 chat-actions 与 Alfred 节点连接
scripts/package.mjs                         将 chat-actions 放入安装包
scripts/verify.mjs                          验证 chat-actions 存在且可执行
tests/workflow/structure.test.js             验证关键字、动作、通知与修饰键连接
README.md                                   记录新会话和清空入口
workflow/chat-actions                       构建产物
workflow/info.plist                         构建产物
dist/AlfredTranslation.alfredworkflow       最终安装包
```

---

### Task 1: Chat Action Controller

**Files:**
- Create: `src/chat/actions.js`
- Create: `tests/chat/actions.test.js`

**Interfaces:**
- Consumes: `dependencies.fileSystem` 的 `exists/readText/writeTextAtomic/ensureDirectory/remove/removeDirectory`。
- Consumes: `dependencies.terminateProcess(processIdentifier)`、`clock()`、`createIdentifier()`。
- Produces: `createChatActionController(dependencies)`。
- Produces: `controller.execute(actionName): 'Started a new chat' | 'Cleared all chat history'`。

- [ ] **Step 1: Write failing controller tests**

Create an in-memory file system and tests equivalent to:

```javascript
/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatActionController } = require('../../src/chat/actions');

test('archives a non-empty current chat before starting a new chat', () => {
  const { controller, files } = createFixture({
    'data/chat.json': '[{"role":"user","content":"Hello"}]',
  });
  assert.equal(controller.execute('new'), 'Started a new chat');
  assert.equal(files.get('data/chat.json'), '[]');
  assert.equal(files.get('data/chat/archive/2026-07-13T10-00-00-000Z-abc.json'), '[{"role":"user","content":"Hello"}]');
});

test('clears all chat files and terminates only a valid stream process', () => {
  const { controller, files, terminatedProcesses } = createFixture({
    'data/chat.json': '[{"role":"user","content":"Hello"}]',
    'data/chat/archive/old.json': '[]',
    'cache/chat-stream.txt': 'data: partial',
    'cache/chat-stream.pid': '1234',
    'cache/translation-cache.json': '{"translatedText":"keep"}',
  });
  assert.equal(controller.execute('clear-all'), 'Cleared all chat history');
  assert.deepEqual(terminatedProcesses, [1234]);
  assert.equal(files.get('data/chat.json'), '[]');
  assert.equal(files.has('data/chat/archive/old.json'), false);
  assert.equal(files.has('cache/chat-stream.txt'), false);
  assert.equal(files.get('cache/translation-cache.json'), '{"translatedText":"keep"}');
});
```

Also cover an empty current chat, damaged JSON, missing directories, invalid PID text, and unknown action names.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/chat/actions.test.js`

Expected: FAIL with `Cannot find module '../../src/chat/actions'`.

- [ ] **Step 3: Implement the controller**

Create `src/chat/actions.js` with this public shape:

```javascript
/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
class ChatActionController {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  execute(actionName) {
    if (actionName === 'new') return this.startNewChat();
    if (actionName === 'clear-all') return this.clearAllHistory();
    throw new Error(`Unsupported chat action: ${actionName}`);
  }

  startNewChat() {
    this.stopActiveStream();
    const currentMessages = this.readValidCurrentMessages();
    if (currentMessages.length > 0) this.archiveCurrentMessages(currentMessages);
    this.dependencies.fileSystem.writeTextAtomic(this.dependencies.paths.currentChat, '[]');
    return 'Started a new chat';
  }

  clearAllHistory() {
    this.stopActiveStream();
    this.dependencies.fileSystem.removeDirectory(this.dependencies.paths.archiveDirectory);
    this.dependencies.fileSystem.writeTextAtomic(this.dependencies.paths.currentChat, '[]');
    return 'Cleared all chat history';
  }
}

function createChatActionController(dependencies) {
  return new ChatActionController(dependencies);
}

module.exports = { createChatActionController };
```

Private helpers must validate that current chat JSON is an array, generate archive name `2026-07-13T10-00-00-000Z-abc.json`, remove stream/PID files, and call `terminateProcess` only for a positive integer PID.

- [ ] **Step 4: Run controller tests and verify GREEN**

Run: `node --test tests/chat/actions.test.js`

Expected: all chat action tests PASS.

- [ ] **Step 5: Commit controller behavior**

```bash
git add src/chat/actions.js tests/chat/actions.test.js
git commit -m "feat: add chat history cleanup controller"
```

---

### Task 2: Alfred Action Nodes and JXA Entry

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `tests/workflow/structure.test.js`
- Generate: `workflow/chat-actions`
- Generate: `workflow/info.plist`

**Interfaces:**
- Consumes: action names `new` and `clear-all`.
- Produces: executable `workflow/chat-actions` with `run(argv)`.
- Produces: stable UIDs `CHAT_ACTION_NEW`, `CHAT_CLEAR_FILTER`, `CHAT_ACTION_CLEAR_ALL`, `CHAT_NEW_NOTIFICATION`, `CHAT_CLEAR_NOTIFICATION`.

- [ ] **Step 1: Write failing Workflow structure tests**

Add assertions that:

```javascript
const newChatConnection = workflowConnections.CHAT_TEXT_VIEW.find(
  (connection) => connection.modifiers === 1048576,
);
assert.equal(newChatConnection.destinationuid, 'CHAT_ACTION_NEW');

const clearFilter = workflowObjects.find((object) => object.uid === 'CHAT_CLEAR_FILTER');
assert.equal(clearFilter.type, 'alfred.workflow.input.scriptfilter');
assert.equal(clearFilter.config.keyword, 'ai-clear');
assert.match(clearFilter.config.script, /Confirm clearing all chat history/);

assert.equal(workflowConnections.CHAT_CLEAR_FILTER[0].destinationuid, 'CHAT_ACTION_CLEAR_ALL');
assert.equal(workflowConnections.CHAT_ACTION_NEW[0].destinationuid, 'CHAT_NEW_NOTIFICATION');
assert.equal(workflowConnections.CHAT_ACTION_CLEAR_ALL[0].destinationuid, 'CHAT_CLEAR_NOTIFICATION');
```

Also require `workflow/chat-actions` to exist, be executable, and start with `#!/usr/bin/osascript -l JavaScript`.

- [ ] **Step 2: Run structure tests and verify RED**

Run: `node --test tests/workflow/structure.test.js`

Expected: FAIL because `chat-actions` and cleanup nodes do not exist.

- [ ] **Step 3: Generate the JXA action entry**

Add `chatActionsScript` to `scripts/build.mjs`. Its `run(argv)` must:

```javascript
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
```

Use Foundation file APIs, `$.NSProcessInfo.processInfo.globallyUniqueString`, and `/bin/kill -TERM <pid>` through `NSTask`. Do not use shell interpolation.

- [ ] **Step 4: Add Alfred nodes and connections**

Generate:

```javascript
{
  uid: 'CHAT_CLEAR_FILTER',
  type: 'alfred.workflow.input.scriptfilter',
  version: 3,
  config: {
    keyword: 'ai-clear',
    title: 'Clear Ask AI History',
    subtext: 'Press Return to review the destructive action',
    argumenttype: 2,
    scriptargtype: 1,
    type: 7,
    scriptfile: '',
    script: "function run() { return JSON.stringify({ items: [{ title: 'Confirm clearing all chat history', subtitle: 'This cannot be undone', arg: 'clear-all', valid: true }] }); }",
  },
}
```

Derive `chatActionsInlineScript` from the generated action implementation without the shebang. Create two `alfred.workflow.action.script` objects with JXA type `7`: `CHAT_ACTION_NEW` appends `executeChatAction('new')`, while `CHAT_ACTION_CLEAR_ALL` appends `executeChatAction('clear-all')`. This avoids depending on upstream query text as the action name. Keep the standalone executable `chat-actions` for testability and future external triggers. Then create two `alfred.workflow.output.notification` objects. Connect Command modifier `1048576` from `CHAT_TEXT_VIEW` to the new-chat action with `vitoclose: true`.

- [ ] **Step 5: Run structure tests and verify GREEN**

Run: `node --test tests/workflow/structure.test.js`

Expected: all Workflow structure tests PASS.

- [ ] **Step 6: Commit Workflow integration**

```bash
git add scripts/build.mjs tests/workflow/structure.test.js workflow/chat-actions workflow/info.plist
git commit -m "feat: add Alfred chat cleanup actions"
```

---

### Task 3: Packaging, Documentation, and Verification

**Files:**
- Modify: `scripts/package.mjs`
- Modify: `scripts/verify.mjs`
- Modify: `README.md`
- Modify: `package.json`
- Test: `tests/workflow/structure.test.js`

**Interfaces:**
- Produces: `.alfredworkflow` containing `chat-actions`.
- Produces: user documentation for `⌘↩` and `ai-clear`.

- [ ] **Step 1: Extend failing package assertions**

Require archive contents:

```javascript
assert.deepEqual(archiveListing, [
  'chat',
  'chat-actions',
  'icon.png',
  'info.plist',
  'translate',
  'translate-view',
]);
```

Add README assertions for `⌘↩`, `ai-clear`, and “清空全部聊天历史”.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/workflow/structure.test.js`

Expected: FAIL because the package and README omit cleanup artifacts.

- [ ] **Step 3: Update packaging and documentation**

- Add `chat-actions` to `scripts/package.mjs` Zip arguments.
- Add `chat-actions` to `requiredArtifactNames` and executable checks in `scripts/verify.mjs`.
- Document `⌘↩` new chat and `ai-clear` confirmation in `README.md`.
- Increment `package.json` and generated Workflow version from `0.3.0` to `0.4.0`.

- [ ] **Step 4: Run fresh full verification**

Run:

```bash
npm test
npm run package
npm run verify
unzip -l dist/AlfredTranslation.alfredworkflow
```

Expected: zero test failures; package contains exactly six runtime files; plist and executable checks PASS.

- [ ] **Step 5: Commit the completed feature**

```bash
git add README.md package.json scripts/package.mjs scripts/verify.mjs tests/workflow/structure.test.js
git commit -m "docs: document chat history cleanup"
```
