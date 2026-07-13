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

  stopActiveStream() {
    const { fileSystem, paths, terminateProcess } = this.dependencies;
    if (fileSystem.exists(paths.streamProcessIdentifier)) {
      const processIdentifier = this.parseValidProcessIdentifier(
        fileSystem.readText(paths.streamProcessIdentifier),
      );
      if (processIdentifier !== undefined) terminateProcess(processIdentifier);
    }
    fileSystem.remove(paths.stream);
    fileSystem.remove(paths.streamProcessIdentifier);
  }

  parseValidProcessIdentifier(processIdentifierText) {
    const normalizedProcessIdentifier = String(processIdentifierText).trim();
    if (!/^\d+$/.test(normalizedProcessIdentifier)) return undefined;

    const processIdentifier = Number(normalizedProcessIdentifier);
    if (!Number.isSafeInteger(processIdentifier) || processIdentifier <= 0) return undefined;
    return processIdentifier;
  }

  readValidCurrentMessages() {
    const { fileSystem, paths } = this.dependencies;
    if (!fileSystem.exists(paths.currentChat)) return [];

    try {
      const currentMessages = JSON.parse(fileSystem.readText(paths.currentChat));
      return Array.isArray(currentMessages) ? currentMessages : [];
    } catch (_error) {
      return [];
    }
  }

  archiveCurrentMessages(currentMessages) {
    const { fileSystem, paths, clock, createIdentifier } = this.dependencies;
    const safeTimestamp = clock().toISOString().replace(/[.:]/g, '-');
    const archivePath = `${paths.archiveDirectory}/${safeTimestamp}-${createIdentifier()}.json`;
    fileSystem.ensureDirectory(paths.archiveDirectory);
    fileSystem.writeTextAtomic(archivePath, JSON.stringify(currentMessages));
  }
}

function createChatActionController(dependencies) {
  return new ChatActionController(dependencies);
}

module.exports = { createChatActionController };
