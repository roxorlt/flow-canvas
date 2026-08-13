# flow-canvas

把业务流程（mermaid / 自然语言 / flowspec JSON）渲染成**横平竖直的正交规范流程图**的 Agent Skill：扁菱形判断、"是/否"端口约定、节点对齐、直角回线、零交叉。产出 SVG 或带缩放/拖拽的单文件 HTML 画布。

排版由零依赖 Python 脚本确定性完成——跨 Claude Code / Codex、跨 Mac / Windows 效果一致，不依赖模型每次发挥。

## 信任声明

- **零第三方依赖**：仅 Python 3.8+ 标准库
- **无网络请求**：任何阶段不访问网络
- **文件写入范围**：仅调用方指定的输出路径
- 脚本可审计（单文件 `scripts/flowlayout.py`）

## 安装

Claude Code：

```bash
git clone https://github.com/roxorlt/flow-canvas.git
ln -s "$(pwd)/flow-canvas" ~/.claude/skills/flow-canvas
```

Codex CLI（支持 Agent Skills 的版本）：

```bash
ln -s "$(pwd)/flow-canvas" ~/.codex/skills/flow-canvas
```

安装后自检（19 项断言，全 PASS 才算可用）：

```bash
python3 flow-canvas/scripts/selftest.py
```

## 直接当 CLI 用（不经过 agent）

```bash
python3 scripts/flowlayout.py examples/member-onboarding.mmd -o out.html --html --title "会员开通流程"
python3 scripts/flowlayout.py examples/member-onboarding.mmd --check   # 布局检查报告
```

## 适用形态

单主干 + 右侧分支链 + 直角回线 + 左侧旁路源 + 主干跳级边（业务审批 / 开通 / 申请流程的典型形状）。自动主干选择不符合业务主链路时可用 `--spine A,B,C` 强制指定。不适用的图形态会**明确报错**并建议 mermaid 原生渲染，不会产出带交叉的烂图。

## 契约

中间格式与产物契约见 [contract/flowspec-v1.md](contract/flowspec-v1.md)。下游项目（如 [flow-walkthrough](https://github.com/roxorlt/flow-walkthrough)）只依赖契约：SVG 根 `data-flowspec="1"`、可交互节点 `data-node="{id}"`、内置 `#sel-ring` 选中框。

## 样式

默认灰度线框、产物禁 emoji（脚本硬校验）。用 `--style style.json` 覆盖任意样式变量（见脚本 `DEFAULT_STYLE`）。

## License

MIT
