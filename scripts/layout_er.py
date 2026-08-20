#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ER 图布局模块（layout_er）。实现 erspec/1 契约，见 contract/erspec-v1.md。"""
import re
import sys

from flowcommon import (
    COMMON_STYLE, text_width, esc, line_crossings, box_overlaps,
    text_overflow_check, svg_open, svg_close, svg_text,
    render_html as _render_html, common_argparse, common_main)

SPEC_VERSION = "erspec/1"
DATA_ATTR = 'data-erspec="1"'

STYLE = dict(COMMON_STYLE)
STYLE.update({
    "header_fill": "#e9e9e9",
    "row_line": "#e0e0e0",
    "fs_card": 11,
    "attr_h": 18,
    "header_h": 26,
    "gap_base": 60,
    "detour_step": 14,
})

MAX_ENTITIES = 8
CARDS = {"||", "o|", "|o", "o{", "}o", "|{", "}|"}
ENTITY_RE = re.compile(r'^([A-Za-z][A-Za-z0-9_]*)\s*\{\s*$')
REL_RE = re.compile(r'^([A-Za-z][A-Za-z0-9_]*)\s+(\S+)\s*--\s*(\S+)\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$')
ATTR_RE = re.compile(r'^([A-Za-z][A-Za-z0-9_]*)\s+([A-Za-z][A-Za-z0-9_]*)\s*([A-Za-z,\s]*?)\s*(?:"(.*)")?\s*$')


def parse_mermaid(src):
    nodes, order = {}, []
    edges = []
    cur = None
    for raw in src.splitlines():
        line = raw.strip()
        if not line or line.startswith("%%") or line.startswith("erDiagram"):
            continue
        m = ENTITY_RE.match(line)
        if m:
            name = m.group(1)
            if name in nodes:
                raise SystemExit("错误：实体 %s 重复定义（形态超限）" % name)
            nodes[name] = {"id": name, "label": [name], "attrs": []}
            order.append(name)
            cur = name
            continue
        if line == "}":
            cur = None
            continue
        m = REL_RE.match(line)
        if m:
            a, cl, cr, b, label = m.groups()
            if cl not in CARDS or cr not in CARDS:
                raise SystemExit("错误：关系 %s--%s 基数记号无法识别（形态超限）" % (cl, cr))
            edges.append({"from": a, "to": b, "cardL": cl, "cardR": cr,
                          "label": [label] if label.strip() else []})
            continue
        if cur:
            m2 = ATTR_RE.match(line)
            if not m2:
                raise SystemExit("错误：实体 %s 的属性行「%s」无法解析（形态超限）" % (cur, line))
            atype, aname, flags, comment = m2.groups()
            fl = [f.strip() for f in (flags or "").split(",") if f.strip()]
            if any(f not in ("PK", "FK") for f in fl):
                raise SystemExit("错误：属性修饰仅支持 PK/FK（形态超限）：%s" % line)
            text = "%s %s" % (atype, aname)
            if comment:
                text += " (%s)" % comment
            nodes[cur]["attrs"].append({"pk": "PK" in fl, "fk": "FK" in fl, "text": text})
            continue
        raise SystemExit("错误：无法识别的行「%s」（形态超限，请改用 mermaid 原生渲染）" % line)
    for e in edges:
        for nid in (e["from"], e["to"]):
            if nid not in nodes:
                raise SystemExit("错误：关系引用了未定义实体 %s（形态超限）" % nid)
        if e["from"] == e["to"]:
            raise SystemExit("错误：实体自引用关系不支持（形态超限）")
    if len(order) > MAX_ENTITIES:
        raise SystemExit("错误：实体数 %d 超过上限 %d（形态超限）" % (len(order), MAX_ENTITIES))
    return {"spec": SPEC_VERSION, "nodes": [nodes[i] for i in order], "edges": edges}


def load_spec(path):
    text = open(path, encoding="utf-8").read()
    return parse_mermaid(text)


def iter_labels(spec):
    for n in spec["nodes"]:
        yield n["label"][0]
        for a in n["attrs"]:
            yield a["text"]
    for e in spec["edges"]:
        for l in e.get("label", []):
            yield l


def _lay_once(ents, edges, st, fs, fsub, fcard):
    """给定实体顺序构建一次布局，返回 lay（crossings 不降级，供候选评估）。"""
    idx = {n["id"]: i for i, n in enumerate(ents)}
    margin = 20
    yc = margin + st["header_h"]
    n_ent = len(ents)
    detours = [e for e in edges if abs(idx[e["from"]] - idx[e["to"]]) > 1]
    gap_w = [st["gap_base"]] * max(0, n_ent - 1)
    for e in edges:
        i, j = idx[e["from"]], idx[e["to"]]
        if abs(i - j) == 1:
            need = text_width(e["cardL"], fcard) + text_width(e["cardR"], fcard) + 24
            gap_w[min(i, j)] = max(gap_w[min(i, j)], need)
        else:
            g_src = i if i < j else i - 1
            g_tgt = j - 1 if i < j else j
            for g in (g_src, g_tgt):
                if 0 <= g < n_ent - 1:
                    gap_w[g] = max(gap_w[g], max(text_width(e["cardL"], fcard),
                                                 text_width(e["cardR"], fcard)) + 10)
    x = margin
    for k, ent in enumerate(ents):
        ent["x"] = x + ent["w"] / 2
        ent["y"] = yc
        x += ent["w"] + (gap_w[k] if k < n_ent - 1 else 0)
    W = round(x + margin)
    yc2 = yc + max(n["h"] for n in ents) / 2 + 16
    # 绕行走廊按 x 跨度升序分配（跨度越大走廊越深；嵌套跨度零交叉）
    detour_order = sorted(detours, key=lambda e: abs(ents[idx[e["from"]]]["x"] - ents[idx[e["to"]]]["x"]))
    detour_y = {id(e): yc2 + st["detour_step"] * k for k, e in enumerate(detour_order)}
    H = round(yc + max(n["h"] for n in ents) / 2 + 10
              + (st["detour_step"] * len(detours) if detours else 0) + margin)

    # 同一端口多条绕行边的 x 错位（方向感知：向间隙内侧，按走廊深度分配——
    # 源侧深贴端口、目标侧浅贴端口，保证嵌套跨度零交叉）
    detour_depth = {id(e): k for k, e in enumerate(detour_order)}
    def _stagger(detours, key, deeper_first):
        use = {}
        for e in detours:
            use.setdefault(e[key], []).append(id(e))
        off = {}
        for nid, ids in use.items():
            ids_sorted = sorted(ids, key=lambda eid: detour_depth[eid], reverse=deeper_first)
            for k, eid in enumerate(ids_sorted):
                off[eid] = 8 * k
        return off
    off_src = _stagger(detours, "from", True)
    off_tgt = _stagger(detours, "to", False)

    routes = []
    for e in edges:
        fi, ti = idx[e["from"]], idx[e["to"]]
        a, b = ents[fi], ents[ti]
        leftward = fi > ti
        if abs(fi - ti) == 1:
            if not leftward:
                p1 = (a["x"] + a["w"] / 2, yc)
                p2 = (b["x"] - b["w"] / 2, yc)
            else:
                p1 = (a["x"] - a["w"] / 2, yc)
                p2 = (b["x"] + b["w"] / 2, yc)
            routes.append({"pts": [p1, p2], "label": e.get("label", []),
                           "lx": (p1[0] + p2[0]) / 2, "ly": yc - 10, "anchor": "middle",
                           "cards": [(e["cardL"], p1[0], p1[1], "end" if leftward else "start", -6 if leftward else 6),
                                     (e["cardR"], p2[0], p2[1], "start" if leftward else "end", 6 if leftward else -6)]})
        else:
            y2 = detour_y[id(e)]
            if not leftward:
                sx, sy = a["x"] + a["w"] / 2, yc
                tx, ty = b["x"] - b["w"] / 2, yc
                soff, toff = off_src.get(id(e), 0), off_tgt.get(id(e), 0)
            else:
                sx, sy = a["x"] - a["w"] / 2, yc
                tx, ty = b["x"] + b["w"] / 2, yc
                soff, toff = -off_src.get(id(e), 0), -off_tgt.get(id(e), 0)
            pts = [(sx, sy), (sx + soff, sy), (sx + soff, y2),
                   (tx + toff, y2), (tx + toff, ty), (tx, ty)]
            routes.append({"pts": pts, "label": e.get("label", []),
                           "lx": (sx + tx) / 2, "ly": y2 - 6, "anchor": "middle",
                           "cards": [(e["cardL"], sx, sy, "end" if leftward else "start", -6 if leftward else 6),
                                     (e["cardR"], tx, ty, "start" if leftward else "end", 6 if leftward else -6)]})
    crossings = line_crossings(routes)
    boxes = [(n["id"], n["x"], n["y"], n["w"], n["h"]) for n in ents]
    overlaps = box_overlaps(boxes)
    overflow = []
    for n in ents:
        def metrics(nd, j, _n=n):
            return fs, _n["w"] - 10
        overflow += text_overflow_check({n["id"]: n}, [n["id"]], metrics)
    for e in edges:
        i, j = idx[e["from"]], idx[e["to"]]
        if abs(i - j) != 1:
            continue
        g = min(i, j)
        need = text_width(e["cardL"], fcard) + text_width(e["cardR"], fcard) + 24
        if need > gap_w[g]:
            overflow.append({"id": e["from"] + "-" + e["to"], "line": 0,
                             "text": e["cardL"] + "--" + e["cardR"],
                             "need": round(need), "avail": round(gap_w[g])})
        if e["label"]:
            need_l = text_width(e["label"][0], st["fs_label"])
            if need_l > gap_w[g] + 8:
                overflow.append({"id": e["from"] + "-" + e["to"], "line": 1,
                                 "text": e["label"][0],
                                 "need": round(need_l), "avail": round(gap_w[g] + 8)})
    return {"nodes": {n["id"]: n for n in ents}, "order": [n["id"] for n in ents],
            "routes": routes, "extra": {"yc": yc, "idx": idx},
            "W": W, "H": H, "style": st,
            "crossings": crossings, "overlaps": overlaps,
            "textOverflow": overflow, "warnings": []}


def layout(spec, style=None, args=None):
    st = dict(STYLE)
    if style:
        st.update(style)
    ents = [dict(n) for n in spec["nodes"]]
    edges = [dict(e) for e in spec["edges"]]
    fs, fsub, fcard = st["fs_node"], st["fs_sub"], st["fs_card"]

    for n in ents:
        widths = [text_width(n["label"][0], fs)] + [text_width(a["text"], fsub) for a in n["attrs"]]
        n["w"] = round(max(widths) + 20)
        n["h"] = st["header_h"] + len(n["attrs"]) * st["attr_h"] + 10

    # barycenter 多轮 + 相邻交换爬山，逐一真实构图取交叉最少者（防振荡）
    base = [dict(n) for n in ents]

    def eval_order(ids):
        order = [next(n for n in base if n["id"] == i) for i in ids]
        trial = [dict(n) for n in order]
        lay = _lay_once(trial, edges, st, fs, fsub, fcard)
        return len(lay["crossings"]), lay

    candidates = [[n["id"] for n in ents]]
    cur = ents
    idx = {n["id"]: i for i, n in enumerate(ents)}
    for _ in range(3):
        sums = {n["id"]: 0.0 for n in ents}
        cnt = {n["id"]: 0 for n in ents}
        for e in edges:
            sums[e["from"]] += idx[e["to"]]
            cnt[e["from"]] += 1
            sums[e["to"]] += idx[e["from"]]
            cnt[e["to"]] += 1
        cur = sorted(cur, key=lambda n: (sums[n["id"]] / cnt[n["id"]] if cnt[n["id"]] else idx[n["id"]]))
        idx = {n["id"]: k for k, n in enumerate(cur)}
        candidates.append([n["id"] for n in cur])

    best = eval_order(candidates[0])
    for ids in candidates[1:]:
        c, lay = eval_order(ids)
        if c < best[0]:
            best = (c, lay)
    guard = 0
    while best[0] > 0 and guard < 3:
        improved = False
        guard += 1
        ids = list(best[1]["order"])
        for k in range(len(ids) - 1):
            ids2 = list(ids)
            ids2[k], ids2[k + 1] = ids2[k + 1], ids2[k]
            c2, lay2 = eval_order(ids2)
            if c2 < best[0]:
                best = (c2, lay2)
                improved = True
                break
        if not improved:
            break
    if best[0] > 0:
        raise SystemExit("错误：barycenter 重排后仍有 %d 处边交叉（形态超限，请简化关系或改用 mermaid 原生渲染）"
                         % best[0])
    return best[1]


def render_svg(lay, title=""):
    st = lay["style"]
    out = svg_open(lay["W"], lay["H"], DATA_ATTR, st)
    for i, nid in enumerate(lay["order"]):
        n = lay["nodes"][nid]
        x0, y0 = n["x"] - n["w"] / 2, n["y"] - n["h"] / 2
        out.append('<g class="entity" id="er-%s-%d">' % (nid, i))
        out.append('<rect x="%g" y="%g" width="%g" height="%g" rx="3" fill="%s" stroke="%s" stroke-width="1.2"/>'
                   % (x0, y0, n["w"], n["h"], st["fill"], st["stroke"]))
        hy = y0 + st["header_h"]
        out.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>'
                   % (x0, y0, n["w"], st["header_h"], st["header_fill"]))
        out.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-width="0.8"/>'
                   % (x0, hy, x0 + n["w"], hy, st["row_line"]))
        out.append(svg_text(n["x"], y0 + st["header_h"] / 2 + 4, st["fs_node"], st["text"],
                            "middle", n["label"][0]))
        for k, a in enumerate(n["attrs"]):
            ay = hy + (k + 0.5) * st["attr_h"] + 4
            deco = ' text-decoration="underline"' if a["pk"] else ""
            style_attr = ' font-style="italic"' if a["fk"] else ""
            out.append('<text x="%g" y="%g" font-size="%d" fill="%s" text-anchor="middle"%s%s>%s</text>'
                       % (n["x"], ay, st["fs_sub"], st["text"], deco, style_attr, esc(a["text"])))
            if k:
                out.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-width="0.6"/>'
                           % (x0 + 6, hy + k * st["attr_h"], x0 + n["w"] - 6, hy + k * st["attr_h"], st["row_line"]))
        out.append('</g>')
    for r in lay["routes"]:
        p = " ".join("%g,%g" % (px, py) for px, py in r["pts"])
        out.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="1.4"/>'
                   % (p, st["edge_color"]))
        if r["label"] and r["lx"] is not None:
            for k, t in enumerate(r["label"]):
                out.append(svg_text(r["lx"], r["ly"] + k * 13, st["fs_label"], st["label_color"],
                                    r["anchor"], t))
        for card, px, py, anchor, dx in r["cards"]:
            out.append(svg_text(px + dx, py - 6, st["fs_card"], st["label_color"], anchor, card))
    out += svg_close()
    return "\n".join(out)


def render_html(lay, title):
    return _render_html(render_svg(lay, title), title, lay["style"]["font_family"])


def main_cli(args):
    return common_main(args, sys.modules[__name__])


if __name__ == "__main__":
    ap = common_argparse("flow-canvas ER 图布局器（erspec/1）")
    raise SystemExit(main_cli(ap.parse_args()))
