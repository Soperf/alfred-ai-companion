# Alfred AI Translation

面向 Alfred 5 Powerpack 的 OpenAI-compatible 翻译与聊天 Workflow，参考 [Alfred 官方 OpenAI Workflow](https://github.com/alfredapp/openai-workflow)。

## 安装

运行 `make package`，双击 `dist/AlfredTranslation.alfredworkflow` 导入 Alfred。

## 配置

在 Workflow 配置中填写：

- `OPENAI_BASE_URL`：如 `https://api.openai.com/v1`、`https://openrouter.ai/api/v1`、`http://127.0.0.1:11434/v1` 或 `http://127.0.0.1:1234/v1`。
- `OPENAI_API_KEY`：本地无鉴权服务可留空。
- `CHAT_MODEL`：聊天模型 ID。
- `TRANSLATION_MODEL`：翻译模型 ID。
- `CHAT_SYSTEM_PROMPT`：可选的聊天系统提示词。
- `MAX_CONTEXT_MESSAGES`：发送给模型的最大上下文消息数，默认 `20`。
- `REQUEST_TIMEOUT_SECONDS`：流停滞超时秒数，默认 `30`。
- `CHAT_KEYWORD`：默认 `ai`。
- `TRANSLATION_KEYWORD`：默认 `tr`。

API Key 保存在本机 Alfred Workflow 用户配置中；请勿提交、共享或写入日志。

## 当前能力

- `tr 文本`：调用 OpenAI-compatible Chat Completions API 翻译文本。最多 240 字且不超过 3 行的短译文直接显示，按回车复制；更长的译文显示预览，按回车进入 Text View 阅读全文，再按回车复制。
- `ai 文本`：在 Alfred Text View 中进行 SSE 流式聊天；当前会话保存到 Alfred Workflow 数据目录，并按 `MAX_CONTEXT_MESSAGES` 截取上下文。

## 开发

运行 `make test` 执行测试，运行 `make package` 构建安装包。
