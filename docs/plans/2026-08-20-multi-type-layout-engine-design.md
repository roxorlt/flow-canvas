# 多图类型排版引擎设计（flow-canvas 扩展）

日期：2026-08-20 · 状态：草案 · 关联 skill：dsh `diagram-style`

## 目标

在 flow-canvas 既有范式（mermaid 子集 → 确定性布局 → 渲染；`--check` 报告交叉为 0 才合格；形态超限报错降级、不产烂图）之上，新增四类图的排版引擎：**架构图、ER 图、甘特图、时序图**。最终所有讲解用图都走引擎级保证；聊天内联与文件交付使用同一份产物。

## 共享管线（不变式）

```
parse（mermaid 子集 / JSON 契约）→ Graph 图模型 → 每类专属 layout → render_svg/render_html → check 报告
```

共享基础件从 `flowlayout.py` 抽出：`text_width`（字体度量）、`node_size`、`wrap_label`、正交边路由（通道/端口）、SVG 原语。

**引擎纪律**：`crossings`（交叉）、`overlaps`（重叠）、`textOverflow`（文字溢出）全部为 0 才合格；形态超限明确报错，调用方降级，不产烂图。

## 四类布局要点

### 架构图 `layout_arch`
- 输入：mermaid flowchart 子集 + subgraph（分层/泳道）
- 泳道分配：节点按 subgraph 或显式 layer 分组；泳道内纵向排列、泳道间横向排列
- 同层节点对齐；正交边、跨层走通道；端口取边中点
- check：交叉/重叠/文字溢出均为 0

### ER 图 `layout_er`
- 输入：mermaid erDiagram 子集（实体、属性、基数关系）
- 实体 = 表格块（属性行高 = 文字行高）；列间距 = 最宽属性 + 基数标签
- 边：左右端口直线优先；交叉时用简单分层重排（barycenter）消除
- check：块重叠 0、边交叉 0

### 甘特图 `layout_gantt`
- 输入：mermaid gantt 子集（section/任务/里程碑/日期）
- 时间轴 nice ticks（1/2/5×10^k 步进）；泳道行高统一
- 任务条文本条内优先，放不下条外右置
- check：同行条重叠 0、标签溢出 0

### 时序图 `layout_seq`
- 输入：mermaid sequenceDiagram 子集（participant/消息/自消息）
- 列间距 = 消息文本最宽 + 边距；消息箭头分层错位防重叠
- check：消息交叉 0、文本溢出 0（激活条默认 v1 不做，YAGNI）

## 契约与测试

- 每类：mermaid 子集规范 + 输出 SVG `data-*` 契约（沿用 flowspec/1 思路，各类型契约版本独立）
- `selftest.py` 扩至每类 ≥3 个 golden 样例 + 降级断言
- `--check` 报告字段统一：`{nodes, edges, crossings, overlaps, textOverflow, warnings, canvas}`

## DSH 接入（第二轨）

- 动态 Cordis 插件 `diagram-viewer`：host 工具 `diagram_render`（引擎子进程 + 落盘 + 报告），client 注册 `tool.call.toolview`（key = `diagram_render`）在对话流内联渲染 SVG（缩放/拖拽、跟随深浅主题）
- 产物落盘约定：`<工作区>/.diagrams/<slug>.svg` + `.html`
- `diagram-style` skill 同步：引擎落地的类型把「首选载体」从 mermaid 改为引擎

## 里程碑（四类并行，分批交付验证）

1. M1：共享基础件抽取 + 四类 layout 骨架与 check 报告
2. M2：四类 golden 自检全绿（每类 3+ 样例）
3. M3：diagram-viewer 插件（文件 + 内联）
4. M4：diagram-style / flow-canvas 文档与 skill 更新、发布

## 开放问题

- 时序图激活条是否进 v1（默认不进）
- 甘特图日期格式：v1 支持 `HH:mm` 与 `YYYY-MM-DD` 两种
