# diagram-viewer 动态插件设计（M3）

> flow-canvas 多图类型引擎的 DSH 接入：host 工具 `diagram_render` 跑引擎落盘，
> client 工具卡片在对话流内联渲染 SVG。本文记录 2026-08-20 会话探查到的接口契约。

## 目标

- host 工具 `diagram_render`：接收 mermaid 源码 + 图类型，调用引擎子进程，
  产物落盘 `<工作区>/.diagrams/<slug>.svg`（可选 `.html`），返回检查报告。
- client 注册 `tool.call.toolview`（key=`diagram_render`），在对话流内联渲染
  SVG（缩放/拖拽、跟随深浅主题）。
- 引擎保证交叉/重叠/文字溢出全 0；形态超限时工具返回降级错误，模型改用
  mermaid 原生渲染。

## 已探查的接口契约（写死依据）

### Host（Builtin）
- `ctx.get(name)` / `ctx.on` / `ctx.effect` / `ctx.provide`
- `harness.defineTool(definition)` → ToolDefinition；
  `harness.registerTool(ctx, tool)` → disposer；
  `harness.handle(method, handler)` → disposer（Package 私有 Client→Host RPC）
- 无 `process`/`child_process`/`fetch` 全局。

### Host Service `subprocess`
- `spawn(spec)`，spec：`{ argv: string[], cwd, stdio: {stdin: 'ignore'|'pipe'|{data},
  stdout: 'pipe'|'inherit'|{maxBytes, spill?}, stderr: 同}, graceMs, signal?, env? }`
- 返回 handle：`{ pid, collected: {stdout?: {readFrom(offset)→{text,nextOffset,lossy,spillPath?}},
  stderr?}, done: Promise<{exitCode, signal}>, terminate() }`
- 无 shell 解释（argv 直传）；目录创建用 `/bin/mkdir -p`。

### Host Service `fs`
- `resolve(path, opts?)` → FsTarget；`readText(target)` → string；
  `writeText(target, content, ...)` → FsWriteOutcome。

### Host Service `sandboxPolicy`
- `workspaceRoot: string`（本会话 = `/Users/roxor/Desktop/work/flow-canvas`）。

### 工具定义形状（dsh-tools）
- `{ name, description, parameters: {key: {type, required?, enum?, description}},
  output: { schema: ValueSchemaSpec, render(args, value) → ContentBlock[] },
  timeoutMs?, isConcurrencySafe?, execute(args, exec) → Promise<value> }`
- ValueSchemaSpec 支持 `type: 'object'/'string'/'boolean'/'json'` 等；
  `exec.signal` 为 AbortSignal，异步工作必须观察它。

### Client（Builtin）
- `React`（createElement/useState/useEffect/useRef，无 JSX）；
  `host.call(method, args)`；`styles.insert(css)` → disposer；`console`。

### Client Slot `tool.call.toolview`（keyed，scope=session）
- 注册：`slots.inject("tool.call.toolview", () => slots.register({name, key: 'diagram_render'}, Component))`
- ownerProps（组件 props）：`{ callId, toolName, block, cwd?, home?, openFile(path), inspect? }`
- `block` 两种形态（判定：`'kind' in block`）：
  - running：`{ callId, toolName, argsRaw, ... }`
  - settled：`{ kind, content: ContentBlock[], error?, isError, call: {argsRaw} }`
  - 结果文本展平：`block.content` 里 `type==='text'` 的 `text` 拼接。

### 主题
- 应用深浅主题跟随 `prefers-color-scheme`；主题 CSS 变量
  `--dsw-alias-bg-layer-1`、`--dsw-alias-border-l1`、`--dsw-alias-label-secondary` 等。
- SVG 适配深浅主题用 CSS：暗色下 `filter: invert(0.92) hue-rotate(180deg)`。

## 工具契约 `diagram_render`

参数：
- `mermaid`（string，必填）：mermaid 子集源码
- `type`（enum flowchart|arch|er|gantt|seq，必填）
- `title`（string，可选）：同时用作 slug
- `html`（boolean，可选）：额外产出可缩放 HTML
- `style`（json，可选）：样式覆盖对象

返回值（output.schema object）：
- 成功：`{ ok: true, slug, svgPath, htmlPath?, report }`
  （report = 引擎 --check 统一报告：nodes/edges/crossings/overlaps/textOverflow/warnings/canvas）
- 降级：`{ ok: false, degraded: true, error }`（引擎报错/不可用/被沙箱拒绝）

render() 只把摘要 JSON 发给模型：`{ slug, type, svgPath, report }`；
client 卡片按 slug 经 `host.call('load-diagram', {slug})` 取落盘 SVG 内联渲染，
模型上下文不背 SVG 正文。

## 引擎路径解析

候选（存在且源码含 `--type` 才采用）：
1. `<workspace>/.worktrees/feat-multi-type-layout/scripts/flowlayout.py`（开发期）
2. `<workspace>/scripts/flowlayout.py`（合并后）

## 产物落盘

`<workspace>/.diagrams/<slug>.mmd|.svg|.html|.style.json`（目录已加入 .gitignore）。

## 已知取舍

- 输出 SVG 不注入 `<foreignObject>`、不依赖浏览器执行 JS；卡片侧仅 CSS 处理主题。
- `--check` 模式退出码：不干净时引擎返回 1；-o 模式不干净时引擎拒绝落盘
  （SystemExit），host 统一翻译成 degraded 错误。
- slug 清洗：保留 `[A-Za-z0-9_\u4e00-\u9fff-]`，截断 60 字符，空则用
  `diagram-<type>-<djb2hash8>`。
