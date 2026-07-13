# Alfred AI Companion



> An OpenAI-compatible AI translation and streaming chat workflow for Alfred 5 Powerpack. Bring OpenAI, OpenRouter, Ollama, LM Studio, and other compatible services into your daily productivity workflow: type to translate, chat on demand.

[中文](README.zh-CN.md)


![img_1.png](img_1.png)


**Alfred 5 · AI Translation · Streaming Chat · OpenAI-compatible · Ollama · LM Studio · Local Models · macOS Productivity**

Alfred AI Companion follows the native interaction patterns of the [official Alfred OpenAI Workflow](https://github.com/alfredapp/openai-workflow), combining professional translation and contextual AI chat into one lightweight workflow. It is not tied to a single model vendor: any service that implements the OpenAI-compatible Chat Completions API can be used according to your own cost, privacy, and model preferences.

## Why choose it

- **Stay in Alfred from input to result**: Use keywords to translate, ask questions, copy results, and view long text — no need to switch between browsers and multiple apps.
- **Compatible with cloud and local models**: Supports OpenAI, OpenRouter, Ollama, LM Studio, and other services compatible with `/v1/chat/completions`.
- **Translation and chat, each optimized**: Translation automatically detects Chinese/English direction; chat uses SSE streaming output and keeps limited context plus conversation history.
- **Adapted for short phrases and long text**: Short translations are copied directly; long translations automatically open in Alfred Text View for more comfortable reading and copying.
- **Zero extra runtime for end users**: The workflow relies only on macOS built-in capabilities and system `curl`; no Node.js, Python, Homebrew, or jq installation is required.
- **Configuration and data stay on your machine**: The API key is stored in Alfred's workflow user configuration; the project never writes secrets into code, logs, build artifacts, or chat history.

## Who it's for

| What you're doing | How Alfred AI Companion helps |
| --- | --- |
| Reading English materials, writing emails, or handling cross-language text | Use `tr text` for instant translation; short results can be copied or pasted directly |
| Wanting quick access to your favorite model through Alfred | Use `ai text` to enter a streaming conversation without opening a browser |
| Using local models such as Ollama or LM Studio | Configure a local OpenAI-compatible endpoint to keep model calls on your device or network |
| Switching between API providers | Just replace the Base URL, API key, and model ID — no workflow changes needed |

## Quick start

### Prerequisites

- macOS
- [Alfred 5](https://www.alfredapp.com/) with Powerpack
- An available OpenAI-compatible Chat Completions service and the corresponding model ID
- Node.js is only needed when **building the install package**; importing a pre-built `.alfredworkflow` does not require Node.js

### Install the workflow

After cloning or downloading this repository, run the following in the project root:

```bash
make package
```

Double-click the generated `dist/AlfredAICompanion.alfredworkflow` and follow Alfred's prompts to import it.

### Configure in three steps

1. Open the workflow's configuration page in Alfred Preferences.
2. Fill in `OPENAI_BASE_URL`, `CHAT_MODEL`, and `TRANSLATION_MODEL`; cloud services usually also require `OPENAI_API_KEY`.
3. Open Alfred and type `tr hello world` or `ai explain this code to me` to start using it.

> For local unauthenticated services, `OPENAI_API_KEY` can be left empty. Do not commit real API keys to the repository, share them in screenshots, or write them to logs.

## Usage

### `tr`: instant AI translation

Type `tr text` to translate content with the configured model:

- When the source text contains Chinese, it is translated to English by default; other languages are translated to Simplified Chinese by default.
- Translations no longer than 240 characters and no more than 3 lines are displayed directly; press `↩` to copy.
- Long translations show a preview first; press `↩` to open Text View to read the full text, then press `↩` again to copy.
- Translation tries to preserve paragraphs, code, variable placeholders, URLs, and basic formatting.

### `ai`: streaming AI chat

Type `ai text` to chat with the configured model in Alfred Text View:

- Content is returned via SSE streaming, reducing wait time for complete answers.
- The current session is saved to the Alfred workflow data directory, and recent context is sent according to `MAX_CONTEXT_MESSAGES`.
- In the Ask AI Text View, press `⌘↩` to start a new conversation; the current non-empty conversation is automatically archived.
- Type `ai-clear` and press Enter to clear all chat history. This cannot be undone, but it does not delete translation cache.

## Service compatibility

The project works through the OpenAI-compatible `POST /v1/chat/completions` endpoint. Below are common configuration examples:

| Service | Example `OPENAI_BASE_URL` | `OPENAI_API_KEY` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | Required |
| OpenRouter | `https://openrouter.ai/api/v1` | Required |
| Ollama | `http://127.0.0.1:11434/v1` | Usually empty |
| LM Studio | `http://127.0.0.1:1234/v1` | Usually empty |

> You can also provide a full URL that already includes `/chat/completions`. The service must support the Chat Completions protocol; this project does not auto-read `/v1/models`, so please enter the model ID manually.

## Configuration reference

| Setting | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_BASE_URL` | Yes | `https://api.openai.com/v1` | OpenAI-compatible base URL or full Chat Completions address |
| `OPENAI_API_KEY` | No | Empty | Can be left empty for local unauthenticated services |
| `CHAT_MODEL` | Yes | Empty | Model ID used for chat |
| `TRANSLATION_MODEL` | Yes | Empty | Model ID used for translation |
| `CHAT_KEYWORD` | Yes | `ai` | Keyword to trigger chat |
| `TRANSLATION_KEYWORD` | Yes | `tr` | Keyword to trigger translation |
| `CHAT_SYSTEM_PROMPT` | No | Empty | Additional system prompt appended to chat requests |
| `CHINESE_TARGET_LANGUAGE` | Yes | `English` | Target language for Chinese source text |
| `OTHER_TARGET_LANGUAGE` | Yes | `Simplified Chinese` | Target language for non-Chinese source text |
| `MAX_CONTEXT_MESSAGES` | Yes | `20` | Maximum number of historical messages sent to the model per chat |
| `REQUEST_TIMEOUT_SECONDS` | Yes | `30` | Timeout in seconds for request or streaming response stalls |

## Privacy and security

- The API key is stored in the local Alfred workflow user configuration and should not appear in code, logs, build artifacts, or screenshots.
- Chat history and translation cache are stored in local Alfred workflow data and cache directories.
- Requests are sent to the service you configure; choose models and data according to that service's privacy policy and deployment location.
- When the API key is empty, the workflow does not send an `Authorization` header, to remain compatible with local unauthenticated services.

## Development and verification

Development requires Node.js. Common commands:

```bash
# Run automated tests
make test

# Build workflow scripts
make build

# Generate an importable Alfred workflow package
make alfredworkflow

# Run workflow structure and smoke verification after build
make verify
```

### How the Workflow is packaged

`make alfredworkflow` first runs `make build` to generate executable JXA entry scripts from the source code. It then runs `scripts/package.mjs`, which uses macOS built-in `/usr/bin/zip` to create `dist/AlfredAICompanion.alfredworkflow`. `make package` remains available as a backward-compatible alias.

```text
src/
  ↓ make build
executable entry scripts generated under workflow/
  ↓ make alfredworkflow
dist/AlfredAICompanion.alfredworkflow
```

The archive contains only the runtime files required for Alfred import:

```text
info.plist
chat
chat-actions
translate
translate-view
icon.png
```

Run `make verify` before packaging or in CI to validate the `info.plist` format, entry-script executable permissions, and the 512 × 512 PNG icon.

Project structure:

```text
src/
├── chat/          # Conversation history, actions, and streaming output
├── core/          # Alfred protocol, SSE, and error handling
├── openai/        # OpenAI-compatible request construction
├── runtime/       # JXA, Foundation, and system curl adapters
└── translation/   # Language direction, prompts, and result classification
workflow/          # Alfred workflow metadata, entry scripts, and icons
scripts/           # Build, package, and verification scripts
tests/             # Unit and contract tests
```

## Contributing

Issues and Pull Requests are welcome, especially for:

- Verification of new OpenAI-compatible service compatibility;
- Improvements to Alfred interaction and accessibility;
- Translation quality, error messages, and test coverage improvements;
- Documentation corrections and usage example additions.

Before submitting, please run `make test` and `make verify`, and avoid committing API keys, chat history, cache, or local build artifacts.

## License

The repository does not yet include a license file. Before public release, please add a suitable `LICENSE` to clearly state permissions for use, modification, and distribution.


![img_2.png](img_2.png)

![img.png](img.png)
