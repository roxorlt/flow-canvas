# dsh-diagram-viewer

DSH 永久插件（bundle）：`diagram_render` 模型工具 + 对话流内联 SVG 卡片。

- Host 半部（`host.js`）：调用 flow-canvas 多图类型排版引擎
  （`scripts/flowlayout.py --type flowchart|arch|er|gantt|seq`），产物落盘
  `<会话工作区>/.diagrams/<slug>.svg`，返回统一检查报告；交叉/重叠/文字溢出
  任一非 0 或形态超限 → 返回降级错误（模型应改用 mermaid 原生渲染）。
- Client 半部（`client.js`）：`tool.call.toolview`（key=`diagram_render`）
  工具卡片，内联渲染 SVG（缩放/拖拽/完整适屏/全屏/pinch 缩放/复制 mermaid、
  跟随深浅主题）。SVG 经工具 `output.presentationMeta` 走 `block.meta` 直通卡片，
  不进模型上下文。

## 安装（用户 profile）

```sh
dsh plugin --profile web add link:/Users/roxor/Desktop/work/flow-canvas/plugin
```

CLI 会安装包（link 符号链接指向本目录）并把 `dsh-diagram-viewer` 追加进
`dsh.profile.bundles`；重启 DSH 后 `cordis.patch.yml` 的 insert 行把工具挂进
组合，永久生效（重启后依然在）。

## 引擎定位

按序取第一个存在且源码含 `--type` 的候选：

1. 环境变量 `DIAGRAM_ENGINE_PATH`（可配 `DIAGRAM_WORKSPACE`）
2. 包内 `../scripts/flowlayout.py`（link 安装时即本仓库 scripts/）
3. `~/Desktop/work/flow-canvas/scripts/flowlayout.py`

产物工作区 = 引擎所在仓库根（`<repo>/.diagrams/`），与 dsh 从哪个目录启动无关。

## ⚠️ 修改 host.js 后的强制流程（防把 dsh 挂掉）

`ctx.tools.register` 是底层入口：`parameters` 与 `output.schema` 必须是**标准
JSON Schema**（type ∈ object/array/string/number/integer/boolean/null；required
是数组；任意 JSON 用「不带 type 的注解节点」表示）。作者 DSL（`type:'json'`、
`required:true` 内联）只有 `defineTool()` 编译器认——写错会让整个 dsh 启动失败。

改完任何插件文件，**先跑验证门再重启**：

```sh
cd ~/.dsh/profiles/web
node /Users/roxor/Desktop/work/flow-canvas/plugin/validate.mjs   # 全部通过才继续
dsh web --port 3187 --no-open    # 备用端口无头冒烟：看到 URL 输出、无报错 → Ctrl+C
dsh web                          # 确认无误后才重启正式实例
```

host.js 里注册已包了 try/catch：注册失败只降级本插件（工具缺席 + 启动日志
打「dsh-diagram-viewer」错误行），不会再拖垮 dsh 启动本身。

## 卸载

```sh
dsh plugin --profile web remove dsh-diagram-viewer
```
