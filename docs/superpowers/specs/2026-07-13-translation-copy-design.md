# Translation Result Copy Design

**Author:** xiaopeng.fxp  
**Date:** 2026-07-13

## Goal

用户在 Alfred 的翻译结果候选项上按回车后，将译文复制到系统剪贴板。

## Interaction

1. 用户输入 `tr <text>`。
2. Script Filter 展示翻译结果。
3. 用户选中结果并按回车。
4. Alfred 原生 Copy to Clipboard 输出节点复制候选项的 `arg`。

翻译结果出现时不自动复制，不启用自动粘贴，也不修改翻译请求行为。

## Workflow Structure

- 新增 `TRANSLATION_COPY_TO_CLIPBOARD` 对象。
- 对象类型为 `alfred.workflow.output.clipboard`，版本为 `3`。
- `clipboardtext` 使用 `{query}`，接收 Script Filter 候选项的 `arg`。
- `autopaste` 和 `transient` 均为 `false`。
- 新增 `TRANSLATION_SCRIPT_FILTER` 到该节点的单向连接。

## Verification

- 结构测试验证剪贴板对象类型和配置。
- 结构测试验证 Script Filter 的连接目标。
- 重新构建并校验 `info.plist`。
- 重新生成 `.alfredworkflow` 包。
