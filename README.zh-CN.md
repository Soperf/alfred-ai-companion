# Alfred AI Companion



> 一款兼容 OpenAI 的 AI 翻译与流式聊天 Alfred 5 Powerpack Workflow。将 OpenAI、OpenRouter、Ollama、LM Studio 等兼容服务带入你的日常效率流程：输入即翻译，随手即聊天。

[English](README.md)


![img_1.png](img_1.png)


**Alfred 5 · AI 翻译 · 流式聊天 · 兼容 OpenAI · Ollama · LM Studio · 本地模型 · macOS 效率工具**

Alfred AI Companion 遵循 [Alfred 官方 OpenAI Workflow](https://github.com/alfredapp/openai-workflow) 的原生交互方式，把专业翻译与上下文 AI 聊天整合进一个轻量 Workflow。它不绑定单一模型厂商：任何实现了兼容 OpenAI 的 Chat Completions API 的服务，都可以根据你自己的成本、隐私与模型偏好来使用。

## 为什么选择它

- **从输入到结果都留在 Alfred 里**：用关键词翻译、提问、复制结果、查看长文本，无需在浏览器和多个应用之间来回切换。
- **同时兼容云端与本地模型**：支持 OpenAI、OpenRouter、Ollama、LM Studio 等兼容 `/v1/chat/completions` 的服务。
- **翻译与聊天分别优化**：翻译自动判断中英方向；聊天采用 SSE 流式输出，并保留有限上下文与会话历史。
- **兼顾短语与长文本**：短翻译直接复制；长翻译自动在 Alfred Text View 中打开，便于更舒适地阅读与复制。
- **终端用户零额外运行时**：Workflow 仅依赖 macOS 内置能力与系统 `curl`，无需安装 Node.js、Python、Homebrew 或 jq。
- **配置与数据保留在本机**：API Key 存储在 Alfred 的 Workflow 用户配置中；项目绝不会把密钥写入代码、日志、构建产物或聊天历史。

## 适合谁

| 你正在做的事 | Alfred AI Companion 如何帮你 |
| --- | --- |
| 阅读英文材料、写邮件或处理跨语言文本 | 用 `tr 文本` 即时翻译；短结果可直接复制或粘贴 |
| 想通过 Alfred 快速访问你喜欢的模型 | 用 `ai 文本` 进入流式对话，无需打开浏览器 |
| 使用 Ollama、LM Studio 等本地模型 | 配置本地兼容 OpenAI 的端点，把模型调用保留在你的设备或网络内 |
| 在不同 API 供应商之间切换 | 只需替换 Base URL、API Key 与模型 ID，无需改动 Workflow |

## 快速开始

### 前置条件

- macOS
- 带 Powerpack 的 [Alfred 5](https://www.alfredapp.com/)
- 一个可用的兼容 OpenAI 的 Chat Completions 服务以及对应的模型 ID
- 仅在**构建安装包**时需要 Node.js；导入预构建的 `.alfredworkflow` 不需要 Node.js

### 安装 Workflow

**方式一 —— 下载预构建安装包（推荐）**

从 [Releases 页面](https://github.com/Soperf/alfred-ai-companion/releases/latest) 下载最新的 `AlfredAICompanion.alfredworkflow`，然后双击并按 Alfred 的提示导入。此方式无需 Node.js。

**方式二 —— 从源码构建**

克隆或下载本仓库后，在项目根目录运行：

```bash
make package
```

双击生成的 `dist/AlfredAICompanion.alfredworkflow`，按 Alfred 的提示导入即可。

### 三步完成配置

1. 在 Alfred 偏好设置中打开该 Workflow 的配置页面。
2. 填写 `OPENAI_BASE_URL`、`CHAT_MODEL` 和 `TRANSLATION_MODEL`；云端服务通常还需要填写 `OPENAI_API_KEY`。
3. 打开 Alfred，输入 `tr hello world` 或 `ai 解释一下这段代码` 即可开始使用。

> 对于本地免鉴权服务，`OPENAI_API_KEY` 可以留空。不要把真实 API Key 提交到仓库、在截图中分享或写入日志。

## 使用方式

### `tr`：即时 AI 翻译

输入 `tr 文本` 即可用配置的模型翻译内容：

- 当源文本包含中文时，默认翻译为英文；其他语言默认翻译为简体中文。
- 不超过 240 个字符且不超过 3 行的翻译直接显示；按 `↩` 复制。
- 长翻译先显示预览；按 `↩` 打开 Text View 阅读全文，再次按 `↩` 复制。
- 翻译会尽量保留段落、代码、变量占位符、URL 与基本格式。

### `ai`：流式 AI 聊天

输入 `ai 文本` 即可在 Alfred Text View 中与配置的模型聊天：

- 内容通过 SSE 流式返回，减少等待完整回答的时间。
- 当前会话会保存到 Alfred Workflow 数据目录，并按 `MAX_CONTEXT_MESSAGES` 发送近期上下文。
- 在 Ask AI Text View 中按 `⌘↩` 开启新会话；当前非空会话会被自动归档。
- 输入 `ai-clear` 并回车可清空所有聊天历史。此操作不可撤销，但不会删除翻译缓存。

## 服务兼容性

本项目通过兼容 OpenAI 的 `POST /v1/chat/completions` 端点工作。以下是常见配置示例：

| 服务 | `OPENAI_BASE_URL` 示例 | `OPENAI_API_KEY` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | 必填 |
| OpenRouter | `https://openrouter.ai/api/v1` | 必填 |
| Ollama | `http://127.0.0.1:11434/v1` | 通常留空 |
| LM Studio | `http://127.0.0.1:1234/v1` | 通常留空 |

> 你也可以提供已包含 `/chat/completions` 的完整 URL。服务必须支持 Chat Completions 协议；本项目不会自动读取 `/v1/models`，请手动填写模型 ID。

## 配置参考

| 配置项 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `OPENAI_BASE_URL` | 是 | `https://api.openai.com/v1` | 兼容 OpenAI 的 Base URL 或完整的 Chat Completions 地址 |
| `OPENAI_API_KEY` | 否 | 空 | 本地免鉴权服务可留空 |
| `CHAT_MODEL` | 是 | 空 | 用于聊天的模型 ID |
| `TRANSLATION_MODEL` | 是 | 空 | 用于翻译的模型 ID |
| `CHAT_KEYWORD` | 是 | `ai` | 触发聊天的关键词 |
| `TRANSLATION_KEYWORD` | 是 | `tr` | 触发翻译的关键词 |
| `CHAT_SYSTEM_PROMPT` | 否 | 空 | 附加到聊天请求的额外系统提示 |
| `CHINESE_TARGET_LANGUAGE` | 是 | `English` | 中文源文本的目标语言 |
| `OTHER_TARGET_LANGUAGE` | 是 | `Simplified Chinese` | 非中文源文本的目标语言 |
| `MAX_CONTEXT_MESSAGES` | 是 | `20` | 每次聊天发送给模型的最大历史消息数 |
| `REQUEST_TIMEOUT_SECONDS` | 是 | `30` | 请求或流式响应停滞的超时秒数 |

## 隐私与安全

- API Key 存储在本地 Alfred Workflow 用户配置中，不应出现在代码、日志、构建产物或截图里。
- 聊天历史与翻译缓存存储在本地 Alfred Workflow 的数据与缓存目录中。
- 请求会发送到你配置的服务；请根据该服务的隐私政策与部署位置选择模型与数据。
- 当 API Key 为空时，Workflow 不会发送 `Authorization` 头，以兼容本地免鉴权服务。

## 开发与验证

开发需要 Node.js。常用命令：

```bash
# 运行自动化测试
make test

# 构建 Workflow 脚本
make build

# 生成可导入的 Alfred Workflow 安装包
make alfredworkflow

# 构建后运行 Workflow 结构与冒烟验证
make verify
```

### Workflow 如何打包

`make alfredworkflow` 会先运行 `make build`，从源码生成可执行的 JXA 入口脚本；随后运行 `scripts/package.mjs`，使用 macOS 内置的 `/usr/bin/zip` 生成 `dist/AlfredAICompanion.alfredworkflow`。`make package` 作为向后兼容的别名依然可用。

```text
src/
  ↓ make build
在 workflow/ 下生成可执行入口脚本
  ↓ make alfredworkflow
dist/AlfredAICompanion.alfredworkflow
```

安装包仅包含 Alfred 导入所需的运行时文件：

```text
info.plist
chat
chat-actions
translate
translate-view
icon.png
```

在打包前或 CI 中运行 `make verify`，用于校验 `info.plist` 格式、入口脚本可执行权限，以及 512 × 512 的 PNG 图标。

项目结构：

```text
src/
├── chat/          # 会话历史、动作与流式输出
├── core/          # Alfred 协议、SSE 与错误处理
├── openai/        # 兼容 OpenAI 的请求构造
├── runtime/       # JXA、Foundation 与系统 curl 适配
└── translation/   # 语言方向、提示词与结果分类
workflow/          # Alfred Workflow 元数据、入口脚本与图标
scripts/           # 构建、打包与验证脚本
tests/             # 单元测试与契约测试
```

## 贡献

欢迎提交 Issue 与 Pull Request，尤其是：

- 新的兼容 OpenAI 服务的兼容性验证；
- Alfred 交互与无障碍性的改进；
- 翻译质量、错误提示与测试覆盖率的提升；
- 文档修正与使用示例的补充。

提交前请运行 `make test` 和 `make verify`，并避免提交 API Key、聊天历史、缓存或本地构建产物。
