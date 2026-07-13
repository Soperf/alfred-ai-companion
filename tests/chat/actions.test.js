/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatActionController } = require('../../src/chat/actions');

function createMemoryFileSystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const ensuredDirectories = [];
  const removedDirectories = [];

  return {
    files,
    ensuredDirectories,
    removedDirectories,
    exists: (path) => files.has(path),
    readText: (path) => files.get(path),
    writeTextAtomic: (path, value) => files.set(path, value),
    ensureDirectory: (path) => ensuredDirectories.push(path),
    remove: (path) => files.delete(path),
    removeDirectory: (directoryPath) => {
      removedDirectories.push(directoryPath);
      for (const filePath of files.keys()) {
        if (filePath.startsWith(`${directoryPath}/`)) files.delete(filePath);
      }
    },
  };
}

function createFixture(initialFiles = {}) {
  const fileSystem = createMemoryFileSystem(initialFiles);
  const terminatedProcesses = [];
  const controller = createChatActionController({
    fileSystem,
    terminateProcess: (processIdentifier) => terminatedProcesses.push(processIdentifier),
    clock: () => new Date('2026-07-13T10:00:00.000Z'),
    createIdentifier: () => 'abc',
    paths: {
      currentChat: 'data/chat.json',
      archiveDirectory: 'data/chat/archive',
      stream: 'cache/chat-stream.txt',
      streamProcessIdentifier: 'cache/chat-stream.pid',
    },
  });

  return {
    controller,
    files: fileSystem.files,
    ensuredDirectories: fileSystem.ensuredDirectories,
    removedDirectories: fileSystem.removedDirectories,
    terminatedProcesses,
  };
}

test('archives a non-empty current chat before starting a new chat', () => {
  const { controller, files, ensuredDirectories } = createFixture({
    'data/chat.json': '[{"role":"user","content":"Hello"}]',
  });

  assert.equal(controller.execute('new'), 'Started a new chat');
  assert.equal(files.get('data/chat.json'), '[]');
  assert.equal(files.get('data/chat/archive/2026-07-13T10-00-00-000Z-abc.json'), '[{"role":"user","content":"Hello"}]');
  assert.deepEqual(ensuredDirectories, ['data/chat/archive']);
});

test('does not archive an empty current chat when starting a new chat', () => {
  const { controller, files, ensuredDirectories } = createFixture({
    'data/chat.json': '[]',
  });

  assert.equal(controller.execute('new'), 'Started a new chat');
  assert.equal(files.get('data/chat.json'), '[]');
  assert.deepEqual(ensuredDirectories, []);
  assert.equal(Array.from(files.keys()).some((path) => path.startsWith('data/chat/archive/')), false);
});

test('resets damaged current chat JSON without archiving it', () => {
  const { controller, files, ensuredDirectories } = createFixture({
    'data/chat.json': '{bad json',
  });

  assert.equal(controller.execute('new'), 'Started a new chat');
  assert.equal(files.get('data/chat.json'), '[]');
  assert.deepEqual(ensuredDirectories, []);
});

test('resets non-array current chat JSON without archiving it', () => {
  const { controller, files, ensuredDirectories } = createFixture({
    'data/chat.json': '{"messages":[]}',
  });

  assert.equal(controller.execute('new'), 'Started a new chat');
  assert.equal(files.get('data/chat.json'), '[]');
  assert.deepEqual(ensuredDirectories, []);
});

test('starts a new chat when current chat and archive directory are missing', () => {
  const { controller, files, ensuredDirectories } = createFixture();

  assert.equal(controller.execute('new'), 'Started a new chat');
  assert.equal(files.get('data/chat.json'), '[]');
  assert.deepEqual(ensuredDirectories, []);
});

test('clears all chat files and terminates only a valid stream process', () => {
  const { controller, files, terminatedProcesses, removedDirectories } = createFixture({
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
  assert.equal(files.has('cache/chat-stream.pid'), false);
  assert.equal(files.get('cache/translation-cache.json'), '{"translatedText":"keep"}');
  assert.deepEqual(removedDirectories, ['data/chat/archive']);
});

test('clears chat state with missing directories and files', () => {
  const { controller, files, terminatedProcesses, removedDirectories } = createFixture();

  assert.equal(controller.execute('clear-all'), 'Cleared all chat history');
  assert.deepEqual(terminatedProcesses, []);
  assert.equal(files.get('data/chat.json'), '[]');
  assert.deepEqual(removedDirectories, ['data/chat/archive']);
});

test('removes stream files without terminating an invalid process identifier', () => {
  const invalidProcessIdentifiers = ['not-a-number', '0', '-7', '12.5', '1234extra'];

  for (const processIdentifierText of invalidProcessIdentifiers) {
    const { controller, files, terminatedProcesses } = createFixture({
      'cache/chat-stream.txt': 'data: partial',
      'cache/chat-stream.pid': processIdentifierText,
    });

    controller.execute('new');

    assert.deepEqual(terminatedProcesses, []);
    assert.equal(files.has('cache/chat-stream.txt'), false);
    assert.equal(files.has('cache/chat-stream.pid'), false);
  }
});

test('rejects unknown action names', () => {
  const { controller } = createFixture();

  assert.throws(() => controller.execute('archive'), /Unsupported chat action: archive/);
});
