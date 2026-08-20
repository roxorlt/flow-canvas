---
name: flow-canvas
description: 把业务图渲染成横平竖直的规范 SVG：流程图（正交规范）、架构图（泳道分层）、ER 图、甘特图、时序图。触发：画流程图、业务流程图、架构图、ER 图、甘特图、时序图、把 mermaid 转规范图、流程图横平竖直、评审用图、render flowchart / orthogonal flowchart / architecture diagram / ER diagram / gantt / sequence diagram。不适用：只要 mermaid 源码文本、脑图、表格。
---

# flow-canvas 多图类型排版引擎

把 mermaid 子集（或自然语言描述）确定性排版为规范 SVG / 可缩放拖拽单文件 HTML。五类图共用一条质量纪律：`--check` 报告 crossings / overlaps / textOverflow 全 0 才合格；形态超限明确报错、调用方降级、不产烂图。排版由零依赖 Python 脚本确定性完成，不要手写 SVG 坐标。

## 五类图与输入子集

| 类型 | `--type` | mermaid 子集 | 布局要点 |
| --- | --- | --- | --- |
| 流程图 | `flowchart`（默认） | flowchart TD：`A["文本"]` `A{"判断"}` `A[["后台"]]`、`-->|label|`、`class X external/backend`、`<br>` 换行 | 单主干 + 左右分支链 + 直角回线 + 跳级边（契约 flowspec/1） |
| 架构图 | `arch` | flowchart + `subgraph 标题 … end` 泳道 | 泳道横向、泳道内纵向；跨泳道边走泳道间共享垂直总线、端口错位 |
| ER 图 | `er` | erDiagram 实体 `{ 类型 属性 PK/FK }`、`A \|\|--o{ B : "标签"` | 实体表格块 + barycenter 重排，左右端口直连；关系标签 ≤4 个汉字 |
| 甘特图 | `gantt` | gantt：`dateFormat YYYY-MM-DD`/`HH:mm`、`section`、任务 `:id, 开始, Nd`、`after id`、`:milestone` | 时间轴 nice ticks（1/2/5×10^k）、统一行高、条内/条外标签 |
| 时序图 | `seq` | sequenceDiagram：`participant A as 名`、`A->>B: 消息`、`A-->>B: 返回`、`A->>A: 自消息` | 生命线 + 消息分层错位防重叠 |

各类型契约（输入语法 / 布局规则 / SVG `data-*` 契约 / 降级规则）：`contract/flowspec-v1.md`、`contract/archspec-v1.md`、`contract/erspec-v1.md`、`contract/ganttspec-v1.md`、`contract/seqspec-v1.md`。

## 执行流程

1. **归一输入**。用户给了 mermaid：直接使用；给了自然语言/会议纪要：你负责梳理成对应类型的 mermaid 子集——节点用短名词句，流程图判断节点必须用"是/否"类标签区分出边（主干选择依赖它），外部系统标 `class … external`、后台/非前端节点标 `class … backend`，架构图用 subgraph 分泳道，ER 图写清 PK/FK 与基数，甘特图写清日期与依赖，时序图写清参与者与消息方向。
2. **渲染**（`scripts/flowlayout.py` 统一入口，`--type` 分发）：
   ```bash
   python3 scripts/flowlayout.py input.mmd -o out.svg                          # 纯 SVG（默认 flowchart）
   python3 scripts/flowlayout.py input.mmd -o out.svg --type arch              # 架构图
   python3 scripts/flowlayout.py input.mmd -o out.svg --type er                # ER 图
   python3 scripts/flowlayout.py input.mmd -o out.svg --type gantt             # 甘特图
   python3 scripts/flowlayout.py input.mmd -o out.svg --type seq               # 时序图
   python3 scripts/flowlayout.py input.mmd --type gantt --check                # 仅布局检查报告
   python3 scripts/flowlayout.py input.mmd -o out.html --html --title "标题"    # 可缩放拖拽画布
   ```
   flowchart 专属：`--spine A,B,C` 强制主干顺序、`--left D1` 分支链放左列；对其他类型无效。
3. **读报告 JSON**。统一字段 `{nodes, edges, crossings, overlaps, textOverflow, warnings, canvas}`：`crossings`/`overlaps`/`textOverflow` **必须全 0 才合格**。非 0 或引擎报「形态超限」时，明确告知用户并降级为 mermaid 原生渲染，**不要交付带缺陷的图**。
4. 产物默认灰度线框、禁 emoji（引擎硬校验）。调用方项目有自己的样式规范时，写覆盖 JSON 经 `--style` 传入（可覆盖键见各模块 STYLE / 流程图 `DEFAULT_STYLE`）；未声明则使用默认。

## 适用形态与降级（红线）

| 类型 | 适用形态 | 超限即报错降级（引擎明确报错，不产烂图） |
| --- | --- | --- |
| flowchart | 单主干 + 左右分支链 + 直角回线 + 左侧旁路源 + 主干跳级边 | 不符合形态（孤立链/孤岛）报错；交叉 > 3 建议 mermaid 原生 |
| arch | 泳道数 ≤ 6；泳道内边仅相邻节点；矩形/外部/后台节点 | decision 菱形、通道溢出 |
| er | 实体 ≤ 8；合法基数记号；属性行齐全 | barycenter 重排后仍有交叉 |
| gantt | `YYYY-MM-DD` / `HH:mm`；任务 ≤ 40；`Nd`/`Nw`/`Nm` 时长；`after` 依赖 | 其他 dateFormat、`until`、解析失败 |
| seq | participant ≤ 6；消息仅相邻列或自消息 | note/alt/loop/opt/激活条、跨列消息、actor |

引擎报错后告知用户该图更适合 mermaid 原生渲染；四类新类型在 `-o` 模式下检查不过会拒绝落盘。

## 联动契约（供下游消费）

- SVG 根元素带类型契约版本：`data-flowspec="1"` / `data-archspec="1"` / `data-erspec="1"` / `data-ganttspec="1"` / `data-seqspec="1"`。
- flowchart 可交互节点 `<g class="node" id="flowchart-{id}-{n}" data-node="{id}">`（判断节点不带 `data-node`）+ 内置 `#sel-ring` 选中框。
- DSH 环境：动态插件 `diagram-viewer` 提供 `diagram_render` 工具（引擎子进程 + 落盘 `<工作区>/.diagrams/<slug>.svg` + 检查报告），工具卡片内联渲染 SVG（缩放/拖拽、跟随深浅主题）。

## 环境降级

- 无 python3：告知用户质量将降级，按对应 `contract/*spec-v1.md` 的布局规则手工生成 SVG（规则完备可手算，但无自动交叉/重叠检测）。
- 无浏览器验证工具：跳过截图目检，`--check` 报告的断言仍然有效。

## 自检

安装后运行 `python3 scripts/selftest.py`（流程图 21 项 + 四类新类型 golden 样例与形态降级断言），全部 PASS 才算可用。
