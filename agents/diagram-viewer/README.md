# diagram-viewer 插件源码存档

DSH 动态 Cordis 插件 `diagram-viewer`（本仓库为插件宿主仓库，插件 id 前缀 `diagr`）：
host 工具 `diagram_render` + client 工具卡片内联 SVG。当前运行版本 `diagr-1/pkg-4`
（会话内实际运行版本以 cordis 记录为准，此处为最新验证通过的源码）。

- `host.js` —— Host 半部：引擎探测（pwd 探测 → exec.agent cwd 线索 →
  sandboxPolicy.workspaceRoot 兜底）、subprocess 文件 I/O、`diagram_render` 工具、
  `load-diagram` Package 私有 RPC。
- `client.js` —— Client 半部：`tool.call.toolview`（key=`diagram_render`）注册，
  内联 SVG 缩放/拖拽/适宽，CSS 跟随 `prefers-color-scheme` 深浅主题。

## 关键实现决策（2026-08-20 实测结论）

1. **不用 `fs` Service 做文件 I/O**：动态插件上下文中 `fs` 对工作区路径的读取不可靠，
   改为全部经 `subprocess`（`/bin/mkdir`、`/bin/sh -c 'cat > "$1"'`、`/bin/cat`）。
2. **`sandboxPolicy.workspaceRoot` 返回部署级根目录（本机为 `/Users/roxor`）而非会话
   工作区**：引擎路径改用「`/bin/pwd` 探测 harness cwd → exec.agent 的 cwd 线索 →
   workspaceRoot 变体」三级兜底；所有候选都必须通过 `grep -q --type` 校验才被采用。
3. **引擎脚本需要可执行位**：仓库已 `git update-index --chmod=+x scripts/*.py`（100755），
   插件直接 spawn `flowlayout.py`（shebang 执行）。
4. **产物相对路径**：解析成功后以工作区为 cwd、`.diagrams/` 相对路径落盘，
   `<slug>.mmd/.svg/.html/.style.json` 同目录。
