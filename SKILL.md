---
name: flow-canvas
description: 把业务流程渲染成横平竖直的正交规范流程图（SVG 或可缩放拖拽的 HTML 画布）。触发：画个流程图、业务流程图、审批流/开通流程/申请流程画图、把 mermaid 转成规范流程图、流程图横平竖直/规范化、评审用的流程图、render flowchart、orthogonal flowchart。不适用：只要 mermaid 源码文本、时序图、甘特图、架构图、脑图。
---

# flow-canvas 正交流程图画布

把 mermaid flowchart（或自然语言描述的业务流程）渲染成横平竖直的规范流程图：扁菱形判断、端口约定（"否"走右侧水平顶点、主干走底部顶点）、节点对齐、直角回线、零交叉。排版由零依赖 Python 脚本确定性完成，不要手写 SVG 坐标。

## 执行流程

1. **归一输入**。三种输入都先变成 mermaid flowchart 子集或 flowspec JSON（契约见 `contract/flowspec-v1.md`）：
   - 用户给了 mermaid：直接使用（支持 `A["文本"]`、`A{"判断"}`、`A[["后台"]]`、`-->|label|`、`<br>` 换行、`class X,Y external/backend` 类型标注）
   - 用户给了自然语言/会议纪要：你负责梳理成 mermaid——节点用短名词句，判断节点必须用"是/否"类标签区分出边（主干选择依赖它），外部系统节点标 `class ... external`，后台/非前端节点标 `class ... backend`
   - 用户给了 flowspec JSON：校验 `"spec": "flowspec/1"` 后直接使用
2. **渲染**：
   ```
   python3 scripts/flowlayout.py input.mmd -o out.svg                 # 纯 SVG
   python3 scripts/flowlayout.py input.mmd -o out.html --html --title "标题"   # 可缩放拖拽画布
   python3 scripts/flowlayout.py input.mmd --check                    # 仅布局检查报告
   ```
3. **读脚本输出的报告 JSON**：`crossings` 必须为 0 才算合格；有交叉时先检查输入（判断节点出边是否都有是/否类标签），仍无法消除或报"不适合正交模式"时，明确告知用户并降级为 mermaid 原生渲染，**不要交付带交叉的图**。
4. 产物默认灰度线框、无 emoji（脚本硬校验）。调用方项目有自己的样式规范时，写一个覆盖 JSON 通过 `--style` 传入（可覆盖键见脚本 `DEFAULT_STYLE`）；未声明则使用默认。

## 适用形态与降级

布局器适用"单主干 + 右侧分支/分支链 + 直角回线 + 左侧旁路源"形态（业务审批/开通/申请流程的典型形状）。不符合时脚本会明确报错而不是产出烂图——此时告知用户该图更适合 mermaid 原生渲染。

## 环境降级

- 无 python3：告知用户质量将降级，按 `contract/flowspec-v1.md` 中的布局规则手工生成 SVG（规则完备可手算，但无自动交叉检测）
- 无浏览器验证工具：跳过截图目检，`--check` 报告的断言仍然有效

## 联动契约（供 flow-walkthrough 等下游消费）

SVG 根元素带 `data-flowspec="1"`；每个可交互节点是 `<g class="node" id="flowchart-{id}-{n}" data-node="{id}">`（判断节点不带 `data-node`）；内置 `#sel-ring` 选中框元素。契约变更会升主版本。

## 自检

安装后运行 `python3 scripts/selftest.py`（17 项断言，含 golden 样例与形态降级检查），全部 PASS 才算可用。
