#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""er 布局 golden 自检（可独立运行；selftest.py 集成时调用 section(check, tmp, run)）。"""
import json
import os
import subprocess
import sys
import tempfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAYOUT = os.path.join(HERE, "flowlayout.py")

GOLDENS = ["er-order", "er-blog", "er-school"]


def run(args):
    return subprocess.run([sys.executable, LAYOUT] + args,
                          capture_output=True, text=True, encoding="utf-8")


def section(check, tmp, run):
    for name in GOLDENS:
        src = os.path.join(ROOT, "examples", name + ".mmd")
        svg = os.path.join(tmp, name + ".svg")
        p = run([src, "--type", "er", "-o", svg])
        check("er %s 布局器运行" % name, p.returncode == 0, p.stderr.strip()[:120])
        if p.returncode == 0:
            rep = json.loads(p.stdout.splitlines()[0])
            check("er %s 报告字段齐全" % name,
                  all(k in rep for k in ("nodes", "edges", "crossings", "overlaps", "textOverflow", "warnings", "canvas")))
            check("er %s 零交叉" % name, rep.get("crossings") == 0, str(rep.get("crossings")))
            check("er %s 零重叠" % name, rep.get("overlaps") == 0, str(rep.get("overlaps")))
            check("er %s 零文字溢出" % name, rep.get("textOverflow") == 0, str(rep.get("textOverflow")))
            check("er %s 画布尺寸为整数" % name,
                  all(isinstance(v, int) for v in rep.get("canvas", [])), str(rep.get("canvas")))
            svg_text = open(svg, encoding="utf-8").read()
            check("er %s SVG 带 data-erspec 契约版本" % name, 'data-erspec="1"' in svg_text)
            check("er %s SVG 含 class=entity" % name, 'class="entity"' in svg_text)
            emoji = [ch for ch in svg_text if 0x1F000 <= ord(ch) <= 0x1FAFF or 0x2600 <= ord(ch) <= 0x27BF]
            check("er %s 产物无 emoji" % name, not emoji, "".join(emoji[:5]))
        p2 = run([src, "--type", "er", "--check"])
        check("er %s --check 通过" % name, p2.returncode == 0, p2.stderr.strip()[:120])
        if p2.returncode == 0:
            rep2 = json.loads(p2.stdout)
            check("er %s --check 报告字段齐全" % name,
                  all(k in rep2 for k in ("nodes", "edges", "crossings", "overlaps", "textOverflow", "warnings", "canvas")))
            check("er %s --check 三项全 0" % name,
                  rep2["crossings"] == 0 and rep2["overlaps"] == 0 and rep2["textOverflow"] == 0)

    html = os.path.join(tmp, "er-golden.html")
    p = run([os.path.join(ROOT, "examples", "er-order.mmd"), "--type", "er", "-o", html, "--html"])
    check("er HTML 画布模式生成", p.returncode == 0 and "setZoom" in open(html, encoding="utf-8").read() and "pointerdown" in open(html, encoding="utf-8").read())

    # ── 形态超限降级 ──
    bad1 = os.path.join(tmp, "er-bad-card.mmd")
    with open(bad1, "w", encoding="utf-8") as f:
        f.write("erDiagram\n  A ||--xx B : \"x\"\n  A { int id PK }\n  B { int id PK }\n")
    p = run([bad1, "--type", "er", "--check"])
    check("er 降级：非法基数记号明确报错", p.returncode != 0 and "形态超限" in (p.stderr or ""), (p.stderr or "").strip()[:80])

    bad2 = os.path.join(tmp, "er-bad-attr.mmd")
    with open(bad2, "w", encoding="utf-8") as f:
        f.write("erDiagram\n  A { int id XX }\n")
    p = run([bad2, "--type", "er", "--check"])
    check("er 降级：非法属性修饰明确报错", p.returncode != 0 and "形态超限" in (p.stderr or ""), (p.stderr or "").strip()[:80])

    bad3 = os.path.join(tmp, "er-bad-cross.mmd")
    with open(bad3, "w", encoding="utf-8") as f:
        # 三实体两两交叉且重排无法消除
        f.write("erDiagram\n  A ||--o{ B : \"x\"\n  B ||--o{ C : \"y\"\n  A ||--o{ C : \"z\"\n"
                "  A { int id PK }\n  B { int id PK }\n  C { int id PK }\n")
    p = run([bad3, "--type", "er", "--check"])
    check("er 降级：无法消除的交叉明确报错", p.returncode != 0 and ("形态超限" in (p.stderr or "") or "交叉" in (p.stderr or "")), (p.stderr or "").strip()[:80])

    # ── emoji 拒绝 ──
    bad4 = os.path.join(tmp, "er-emoji.mmd")
    with open(bad4, "w", encoding="utf-8") as f:
        f.write("erDiagram\n  A { int id PK }\n  B { int 数量🚀 }\n")
    p = run([bad4, "--type", "er", "--check"])
    check("er emoji 输入被拒绝", p.returncode != 0, (p.stderr or "").strip()[:80])


if __name__ == "__main__":
    results = []

    def check(name, ok, detail=""):
        results.append((name, bool(ok), detail))
        print("%s %s%s" % ("PASS" if ok else "FAIL", name, ("  [%s]" % detail) if detail and not ok else ""))

    tmp = tempfile.mkdtemp(prefix="flowcanvas-er-")
    section(check, tmp, run)
    fails = [r for r in results if not r[1]]
    print("\n%d/%d 通过" % (len(results) - len(fails), len(results)))
    sys.exit(1 if fails else 0)
