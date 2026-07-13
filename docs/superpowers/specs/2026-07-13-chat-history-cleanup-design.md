# Ask AI Chat History Cleanup Design

**Author:** xiaopeng.fxp  
**Date:** 2026-07-13

## Goal

为 Ask AI 增加两个互相独立的会话维护操作：归档当前对话并开始新会话，以及经二次确认后清空全部聊天历史。

## Interaction

### New Chat

- 用户在 Ask AI Text View 中按 `⌘↩`。
- Workflow 终止尚未结束的聊天流。
- 当前会话非空时归档到 `chat/archive/`。
- `chat.json` 重置为空数组。
- Alfred 显示“已开始新会话”通知。

### Clear All Chat History

- 用户输入 `ai-clear`。
- Script Filter 展示唯一候选项“确认清空全部聊天历史”，但不自动执行。
- 用户按回车后，Workflow 终止尚未结束的聊天流。
- 删除当前会话、全部聊天归档、聊天流文件和 PID 文件。
- 重新创建空的 `chat.json`。
- Alfred 显示“已清空全部聊天历史”通知。

翻译缓存不在清理范围内。

## Components

### Chat Actions

新增独立 `chat-actions` JXA 入口，接受动作名：

- `new`：归档非空当前会话并重置。
- `clear-all`：删除全部聊天状态并重置。

该入口集中处理流进程终止、文件清理和归档，聊天 Text View 不直接执行维护操作。

### Alfred Nodes

- `CHAT_TEXT_VIEW` 的 Command 修饰键连接到 `CHAT_ACTION_NEW`。
- `CHAT_ACTION_NEW` 执行 `new`，随后显示通知。
- `CHAT_CLEAR_FILTER` 使用关键字 `ai-clear`，仅返回确认候选项。
- `CHAT_CLEAR_FILTER` 连接 `CHAT_ACTION_CLEAR_ALL`。
- `CHAT_ACTION_CLEAR_ALL` 执行 `clear-all`，随后显示通知。

## State and Safety

- 当前会话：`{alfred_workflow_data}/chat.json`。
- 归档目录：`{alfred_workflow_data}/chat/archive/`。
- 流缓存：`{alfred_workflow_cache}/chat-stream.txt`。
- 流 PID：`{alfred_workflow_cache}/chat-stream.pid`。
- 只允许终止 PID 文件中记录的正整数进程。
- 文件不存在或目录为空时，操作保持幂等并返回成功。
- 损坏的当前会话不进入归档；清理后创建合法的空会话文件。

## Verification

- 单元测试覆盖非空会话归档、空会话、清空全部、缺失目录和合法 PID 终止。
- 结构测试覆盖 `⌘↩` 连接、`ai-clear` 确认入口、两个动作节点和通知节点。
- 构建验证 `chat-actions` 可执行且进入 `.alfredworkflow` 包。
- 全量测试、plist 校验和打包校验必须通过。
