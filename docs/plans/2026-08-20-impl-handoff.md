# 多图类型排版引擎 · 实现交接文档

> 给新会话的 agent：读完本文件即可开始实现。本文件自包含，所需背景都在仓库内。

## 工作区绝对路径

```
/Users/roxor/Desktop/work/flow-canvas
```

新会话直接把工作区指到这个目录。

## 一句话任务

扩展 flow-canvas：在现有流程图确定性排版引擎之上，新增**架构图 / ER 图 / 甘特图 / 时序图**四类布局模块，保持既有质量纪律（check 报告全 0 才合格、形态超限报错降级、不产烂图）；随后做 DSH 动态插件 `diagram-viewer`（host 工具 `diagram_render` 跑引擎落盘 + client 工具卡片在对话流内联渲染 SVG）。

## 必读（按顺序）

1. `docs/plans/2026-08-20-multi-type-layout-engine-design.md` —— 已确认的设计：目标、共享管线、四类布局要点、契约与测试、里程碑。**以它为准绳**。
2. `scripts/flowlayout.py` —— 现有引擎（约 800 行：`parse_mermaid → Graph → layout → render_svg/render_html`），共享基础件从这里抽。
3. `scripts/selftest.py` + `contract/flowspec-v1.md` —— 现有质量纪律与契约范例（`crossings: 0` 才算合格）。
4. `SKILL.md` —— 本技能边界：流程图专属；其余类型的规范在 dsh skill `diagram-style`（引擎落地后同步更新它）。

## 环境与基线

- 零依赖 Python 3.8+；macOS 自带 python3 即可。
- git 基线：main = `caabab0`（干净），remote 为作者本人仓库。
- 自检基线：`python3 scripts/selftest.py` 现有断言全 PASS。

## 实现步骤（对应设计文档里程碑）

1. **准备**：`git worktree add`（放 `.worktrees/` 需先加入 .gitignore）新分支 `feat/multi-type-layout`；跑 `python3 scripts/selftest.py` 确认基线全绿。
2. **M1 共享基础件 + 四类骨架**：抽 `text_width`/`node_size`/`wrap_label`/正交边路由为共享模块；新建 `layout_arch.py`、`layout_er.py`、`layout_gantt.py`、`layout_seq.py`；CLI 加 `--type` 参数分发。
3. **M2 golden 自检**：每类 ≥3 个 golden 样例 + 形态超限降级断言；`--check` 报告统一字段 `{nodes, edges, crossings, overlaps, textOverflow, warnings, canvas}`，全部为 0 才合格。
4. **M3 DSH 接入**：动态 Cordis 插件 `diagram-viewer`——host 工具 `diagram_render`（引擎子进程 + 落盘 `<工作区>/.diagrams/<slug>.svg` + 检查报告），client 注册 `tool.call.toolview`（key=`diagram_render`）内联渲染 SVG（缩放/拖拽、跟随深浅主题）。
5. **M4 文档同步**：更新本仓库 `SKILL.md`/`README.md`，并同步 dsh 的 `diagram-style` skill（引擎落地的图类型「首选载体」从 mermaid 改为引擎）。

## 建议使用的技能（新会话内）

`using-git-worktrees` → `writing-plans`（把 M1–M4 拆成 bite-sized 任务）→ `dispatching-parallel-agents`（共享基础件冻结后，四个 layout 模块并行派发子 agent）。

## 质量红线

- 交叉 / 重叠 / 文字溢出任一非 0：报错降级，不产出图。
- 每类 selftest 必带 golden 样例与形态超限断言。
- 四类并行开发，但交付按类型分批验证（不要一次混入大量未验证代码）。

## 建议的开场

新会话（工作区 = 本目录）直接说：

> 读 docs/plans/2026-08-20-impl-handoff.md，按它开始实现；先建 goal 跟踪整个项目。
