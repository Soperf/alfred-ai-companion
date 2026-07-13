/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
class ChatHistory {
  constructor(fileSystem, paths, clock, createIdentifier) {
    this.fileSystem = fileSystem;
    this.paths = paths;
    this.clock = clock;
    this.createIdentifier = createIdentifier;
  }

  loadCurrent() {
    if (!this.fileSystem.exists(this.paths.currentPath)) {
      this.fileSystem.writeTextAtomic(this.paths.currentPath, '[]');
      return { messages: [] };
    }

    try {
      return { messages: JSON.parse(this.fileSystem.readText(this.paths.currentPath)) };
    } catch (_error) {
      const timestamp = this.getSafeTimestamp();
      const recoveryPath = this.paths.currentPath.replace(/\.json$/, `.corrupt-${timestamp}.json`);
      this.fileSystem.move(this.paths.currentPath, recoveryPath);
      this.fileSystem.writeTextAtomic(this.paths.currentPath, '[]');
      return { messages: [], recoveryNotice: 'Recovered a damaged chat history' };
    }
  }

  append(message) {
    const loadedChat = this.loadCurrent();
    this.replaceCurrent(loadedChat.messages.concat(message));
  }

  replaceCurrent(messages) {
    this.fileSystem.writeTextAtomic(this.paths.currentPath, JSON.stringify(messages));
  }

  archiveCurrent() {
    const loadedChat = this.loadCurrent();
    const archivePath = `${this.paths.archiveDirectory}/${this.getSafeTimestamp()}-${this.createIdentifier()}.json`;
    this.fileSystem.ensureDirectory(this.paths.archiveDirectory);
    this.fileSystem.writeTextAtomic(archivePath, JSON.stringify(loadedChat.messages));
    this.replaceCurrent([]);
    return archivePath;
  }

  renderMarkdown(ignoreInterrupted) {
    const { messages } = this.loadCurrent();
    return messages.reduce((markdown, message, messageIndex) => {
      if (message.role === 'assistant') return `${markdown}${message.content}\n\n`;
      if (message.role !== 'user') return markdown;

      const isLastMessage = messageIndex === messages.length - 1;
      const nextMessage = messages[messageIndex + 1];
      const hasNoAnswer = !nextMessage || nextMessage.role === 'user';
      const interruptionMarker = hasNoAnswer && isLastMessage && !ignoreInterrupted
        ? '\n\n[Answer Interrupted]\n\n'
        : '\n\n';
      return `${markdown}# ⊙ You\n\n${message.content}\n\n# ⊚ Assistant${interruptionMarker}`;
    }, '');
  }

  getSafeTimestamp() {
    return this.clock().toISOString().replace(/[.:]/g, '-');
  }
}

function createChatHistory(fileSystem, paths, clock, createIdentifier) {
  return new ChatHistory(fileSystem, paths, clock, createIdentifier);
}

if (typeof module !== 'undefined') {
  module.exports = { createChatHistory };
}
