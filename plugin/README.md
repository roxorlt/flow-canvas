# dsh-diagram-viewer

DSH 永久插件（bundle）：`diagram_render` 模型工具 + 对话流内联 SVG 卡片。

- Host 半部（`host.js`）：调用 flow-canvas 多图类型排版引擎
  （`scripts/flowlayout.py --type flowchart|arch|er|gantt|seq`），产物落盘
  `<会话工作区>/.diagrams/<slug>.svg`，返回统一检查报告；交叉/重叠/文字溢出
  任一非 0 或形态超限 → 返回降级错误（模型应改用 mermaid 原生渲染）。
- Client 半部（`client.js`）：`tool.call.toolview`（key=`diagram_render`）
  工具卡片，内联渲染 SVG（缩放/拖拽/适宽、跟随深浅主题）。SVG 经工具
  `output.presentationMeta` 走 `block.meta` 直通卡片，不进模型上下文。

## 安装（用户 profile）

```sh
dsh plugin --profile web add link:/Users/roxor/Desktop/work/flow-canvas/plugin
```

CLI 会安装包（link 符号链接指向本目录）并把 `dsh-diagram-viewer` 追加进
`dsh.profile.bundles`；重启 DSH 后 `cordis.patch.yml` 的 insert 行把工具挂进
组合，永久生效（重启后依然在）。

## 引擎定位

按序取第一个存在且源码含 `--type` 的候选：

1. 环境变量 `DIAGRAM_ENGINE_PATH`
2. 包内 `../scripts/flowlayout.py`（link 安装时即本仓库 scripts/）
3. `~/Desktop/work/flow-canvas/scripts/flowlayout.py`

工作区取 `process.cwd()`（harness 会话工作区），产物落盘其下 `.diagrams/`。

## 卸载

```sh
dsh plugin --profile web remove dsh-diagram-viewer
```
