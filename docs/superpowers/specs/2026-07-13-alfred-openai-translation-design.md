# Alfred OpenAI Translation Workflow 设计

## 1. 背景与目标

本项目面向 Alfred 5 Powerpack，参考 [Alfred 官方 OpenAI Workflow](https://github.com/alfredapp/openai-workflow) 的原生交互方式，构建一个零运行时依赖的 OpenAI-compatible Workflow。

首版同时提供通用聊天和专用翻译能力：聊天保留流式输出、上下文、历史记录和中断能力；翻译提供自动语言方向、候选列表和长文本 Text View。服务地址、API Key、聊天模型和翻译模型均可配置。

## 2. 已确认范围

### 2.1 包含

- Alfred 关键词 `ai`：通用流式聊天。
- Alfred 关键词 `tr`：专用翻译。
- Universal Action：将选中文字发送到聊天或翻译入口。
- OpenAI-compatible `POST /v1/chat/completions`。
- 可配置 Base URL 和可选 API Key。
- 聊天与翻译共用 Base URL、API Key，分别配置模型 ID。
- 中文默认翻译成英文，其他语言默认翻译成简体中文。
- 目标语言可通过 Workflow 配置覆盖。
- 短译文直接显示在 Script Filter，长译文进入 Text View。
- 聊天历史、翻译单次缓存、错误恢复和安全日志。
- 构建、测试、验证和 `.alfredworkflow` 打包。

### 2.2 不包含

- DALL·E 或其他图片生成能力。
- OpenAI Responses API。
- 自动探测服务协议。
- 调用 `/v1/models` 动态获取模型列表。
- Azure OpenAI 专有认证协议。
- 多套服务配置或聊天、翻译完全独立的密钥。
- Node.js、Python、Homebrew、`jq` 等最终用户运行时依赖。

## 3. 技术路线

运行时采用 macOS 原生 JXA（JavaScript for Automation）、Foundation 和系统自带的 `curl`。Alfred Text View 负责聊天流式展示，Script Filter 负责翻译候选展示。

项目采用“可测试源码 + 构建产物”模式。纯逻辑与 JXA/macOS 适配层分离；构建阶段将源码组合为 Workflow 内可直接执行的独立脚本。Node.js 可以作为开发期测试或构建工具，但不得进入最终包，也不得成为使用 Workflow 的前置条件。

建议目录结构：

```text
src/
├── core/                 配置、URL、文件和错误处理
├── openai/               Chat Completions 请求与 SSE 解析
├── chat/                 上下文、历史和流式聊天
├── translation/          语言识别、Prompt 和结果分类
└── alfred/               Script Filter 与 Text View 适配

workflow/
├── info.plist
├── chat
├── translate
└── icon.png

tests/
scripts/
dist/
```

## 4. 组件设计

### 4.1 配置组件

配置组件从 Alfred Workflow 环境变量读取配置，执行必填校验、默认值处理和 Base URL 规范化。它向上层返回结构化配置，不允许业务组件直接散落读取环境变量。

Base URL 规则：

- `https://api.example.com/v1` 转换为 `https://api.example.com/v1/chat/completions`。
- 已以 `/chat/completions` 结尾的完整地址原样使用。
- 移除拼接边界处多余的 `/`。
- 仅接受 `http://` 或 `https://` 地址。
- API Key 为空时不发送 Authorization Header，以兼容本地服务。

### 4.2 OpenAI-compatible 客户端

客户端负责：

- 使用 `NSTask` 参数数组调用 `/usr/bin/curl`，不通过 Shell 拼接用户输入。
- 构造 `model`、`messages`、`stream` 请求体。
- 非空 API Key 使用 `Authorization: Bearer <key>`。
- 聊天使用 SSE 流式响应，翻译使用非流式响应。
- 提取 HTTP 状态、OpenAI 标准错误及非标准错误正文。
- 对外暴露与 Alfred UI 无关的请求结果。

### 4.3 聊天组件

聊天组件维护当前对话及归档。发送问题时加载最近 `MAX_CONTEXT_MESSAGES` 条消息，附加可选系统 Prompt，再发起流式请求。

流式内容先写入缓存文件，Text View 通过 Alfred rerun 周期读取增量内容。请求完成后，回答写入当前会话；超时或主动中断时，已生成内容仍可保留并标记为未完整结束。

### 4.4 翻译组件

翻译组件负责语言方向和翻译约束：

- 原文包含 CJK Unified Ideographs 时，使用 `CHINESE_TARGET_LANGUAGE`。
- 否则使用 `OTHER_TARGET_LANGUAGE`。
- Prompt 要求只返回译文，不返回说明、引号或 Markdown 围栏。
- 保留段落、代码、变量占位符、URL 和基础格式。

翻译完成后，结果不超过 240 个字符且不超过 3 行时判定为短译文；否则判定为长译文。最近一次翻译缓存在 `latest-translation.json`，缓存身份包含原文、目标语言、Base URL 和翻译模型。

### 4.5 Alfred 适配组件

适配组件仅负责 Alfred JSON 契约、变量传递和行为映射，不包含 API 调用或翻译判断。

聊天 Text View 行为：

- `↩`：继续提问。
- `⌘↩`：归档当前会话并开始新会话。
- `⌥↩`：复制最后一次回答。
- `⌃↩`：复制完整对话。
- `⇧↩`：中断当前请求。
- 在 `ai` 关键词入口按 `⌥↩`：浏览历史会话。

翻译 Script Filter 行为：

- 短译文 `↩`：复制译文。
- 短译文 `⌘↩`：复制并粘贴到当前应用。
- 长译文 `↩`：进入 Text View 阅读全文。
- 长译文 `⌘↩`：直接复制全文。

## 5. 配置契约

| 配置项 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 是 | OpenAI-compatible Base URL 或完整 Chat Completions 地址 |
| `OPENAI_API_KEY` | 空 | 否 | 本地无鉴权服务允许留空 |
| `CHAT_MODEL` | 空 | 是 | 聊天模型 ID，手工填写 |
| `TRANSLATION_MODEL` | 空 | 是 | 翻译模型 ID，手工填写 |
| `CHAT_KEYWORD` | `ai` | 是 | 聊天关键词 |
| `TRANSLATION_KEYWORD` | `tr` | 是 | 翻译关键词 |
| `CHAT_SYSTEM_PROMPT` | 空 | 否 | 聊天系统 Prompt |
| `CHINESE_TARGET_LANGUAGE` | `English` | 是 | 中文原文的目标语言 |
| `OTHER_TARGET_LANGUAGE` | `Simplified Chinese` | 是 | 非中文原文的目标语言 |
| `MAX_CONTEXT_MESSAGES` | `20` | 是 | 发送给模型的最近消息数 |
| `REQUEST_TIMEOUT_SECONDS` | `30` | 是 | 连接停滞和请求超时阈值 |
| `KEEP_CHAT_HISTORY` | 开启 | 是 | 新会话时是否归档当前会话 |

API Key 仅保存在 Alfred Workflow 用户配置中。代码、会话、缓存、构建产物和日志均不得写入密钥。

## 6. 数据设计

```text
alfred_workflow_data/
├── chat/current.json
└── chat/archive/<timestamp>-<id>.json

alfred_workflow_cache/
├── chat-stream.txt
├── chat-process.pid
└── latest-translation.json
```

聊天消息使用 OpenAI `role`、`content` 结构持久化。写文件采用原子替换，避免进程中断留下半份 JSON。损坏的会话文件改名备份后重新创建，禁止静默覆盖。

## 7. 错误处理

- 配置缺失：返回不可执行的 Alfred 候选项，明确指出缺失字段。
- HTTP/API 错误：优先读取 `error.message`；否则展示 HTTP 状态和截断正文。
- SSE 异常：忽略无法解析的残缺分片；流结束仍无有效内容时返回协议错误。
- 连接停滞：终止请求进程，保留已有内容并清理临时文件。
- 用户中断：仅终止当前 Workflow 记录的 PID，避免误杀其他进程。
- 会话损坏：备份损坏文件，创建新会话，并向用户显示恢复提示。
- 日志脱敏：禁止输出 API Key、Authorization Header 和完整敏感请求体。

## 8. 测试策略

### 8.1 单元测试

- Base URL 规范化及非法 URL。
- 中英文方向识别。
- 翻译 Prompt 和格式约束。
- OpenAI 标准、非标准错误提取。
- SSE 正常分片、跨行分片、残缺 JSON 和结束原因。
- 240 字符、3 行边界的长短译文分类。
- 翻译缓存命中及配置变化后的失效。

### 8.2 API 契约测试

本地模拟 HTTP 服务覆盖：

- 标准非流式响应。
- 标准 SSE 响应。
- 401、429、500。
- 超时和连接中断。
- 空 API Key 不发送 Authorization Header。
- `CHAT_MODEL` 与 `TRANSLATION_MODEL` 分别生效。

### 8.3 Workflow 验证

- `plutil` 验证 `info.plist`。
- 校验 JXA 文件可执行权限。
- 校验 Alfred 节点引用的脚本和资源存在。
- `osascript` 对构建入口执行冒烟测试。
- 校验最终包不包含密钥、缓存、测试服务和开发依赖。

标准命令：

```text
make test
make build
make package
make verify
```

最终产物为 `dist/AlfredTranslation.alfredworkflow`。

## 9. 验收标准

- Workflow 可导入 Alfred 5，最终用户无需额外安装运行时。
- `ai` 支持流式聊天、上下文、历史和中断。
- `tr` 支持自动翻译方向、短译文候选和长译文 Text View。
- 两个入口均支持 Universal Action。
- OpenAI、OpenRouter、Ollama 和 LM Studio 均有明确配置方式。
- 网络与协议异常不会遗留失控进程或破坏会话数据。
- 所有自动化测试和 Workflow 结构检查通过。
- 新建代码文件包含 `@author xiaopeng.fxp` 和创建日期 `@date`。

## 10. 来源与许可

交互与实现路线参考：

- [alfredapp/openai-workflow](https://github.com/alfredapp/openai-workflow)
- [Alfred Workflow User Configuration](https://www.alfredapp.com/help/workflows/user-configuration/)
- [Alfred Text View](https://www.alfredapp.com/help/workflows/user-interface/text/)

若复用或改编官方源码，应保留其 BSD-3-Clause 许可文本和版权声明，并在项目 README 中标注来源。项目不得误用 Alfred 官方名称或暗示官方背书。
