/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatHistory } = require('../../src/chat/history');

function createMemoryFileSystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    exists: (path) => files.has(path),
    readText: (path) => files.get(path),
    writeTextAtomic: (path, value) => files.set(path, value),
    move: (sourcePath, destinationPath) => {
      files.set(destinationPath, files.get(sourcePath));
      files.delete(sourcePath);
    },
    ensureDirectory: () => undefined,
  };
}

test('creates and appends to an empty current chat', () => {
  const fileSystem = createMemoryFileSystem();
  const history = createChatHistory(fileSystem, { currentPath: 'current.json', archiveDirectory: 'archive' }, () => new Date('2026-07-13T10:00:00.000Z'), () => 'abc');

  assert.deepEqual(history.loadCurrent().messages, []);
  history.append({ role: 'user', content: 'Hello' });
  assert.deepEqual(history.loadCurrent().messages, [{ role: 'user', content: 'Hello' }]);
});

test('archives the current chat with a stable timestamp and identifier', () => {
  const fileSystem = createMemoryFileSystem({
    'current.json': JSON.stringify([{ role: 'user', content: 'Hello' }]),
  });
  const history = createChatHistory(fileSystem, { currentPath: 'current.json', archiveDirectory: 'archive' }, () => new Date('2026-07-13T10:00:00.000Z'), () => 'abc');

  const archivePath = history.archiveCurrent();

  assert.equal(archivePath, 'archive/2026-07-13T10-00-00-000Z-abc.json');
  assert.equal(fileSystem.files.get(archivePath), '[{"role":"user","content":"Hello"}]');
  assert.equal(fileSystem.files.get('current.json'), '[]');
});

test('backs up corrupted history and returns a recovery notice', () => {
  const fileSystem = createMemoryFileSystem({ 'current.json': '{bad json' });
  const history = createChatHistory(fileSystem, { currentPath: 'current.json', archiveDirectory: 'archive' }, () => new Date('2026-07-13T10:00:00.000Z'), () => 'abc');

  const loadedChat = history.loadCurrent();

  assert.deepEqual(loadedChat.messages, []);
  assert.equal(loadedChat.recoveryNotice, 'Recovered a damaged chat history');
  assert.equal(fileSystem.files.get('current.corrupt-2026-07-13T10-00-00-000Z.json'), '{bad json');
});

test('renders a final unanswered user message as interrupted', () => {
  const fileSystem = createMemoryFileSystem({
    'current.json': JSON.stringify([{ role: 'user', content: 'Hello' }]),
  });
  const history = createChatHistory(fileSystem, { currentPath: 'current.json', archiveDirectory: 'archive' }, () => new Date(), () => 'abc');

  assert.match(history.renderMarkdown(false), /\[Answer Interrupted\]/);
});
