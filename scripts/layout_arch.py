#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""架构图布局模块（layout_arch）。实现 archspec/1 契约，见 contract/archspec-v1.md。"""
import re
import sys

from flowcommon import (
    COMMON_STYLE, text_width, esc, port,
    ortho_crossings, box_overlaps, text_overflow_check,
    svg_open, svg_close, arrow_marker, svg_text,
    render_html as _render_html, common_argparse, common_main)

SPEC_VERSION = "archspec/1"
DATA_ATTR = 'data-archspec="1"'

STYLE = dict(COMMON_STYLE)
STYLE.update({
    "stroke_external": "#888888",
    "fill_external": "#ffffff",
    "stroke_backend": "#999999",
    "fill_backend": "#d9d9d9",
    "band_fill": "#f7f7f7",
    "band_stroke": "#e0e0e0",
    "band_text": "#777777",
    "fs_section": 12,
    "gap_base": 60,
    "gap_step": 16,
    "gap_cap": 240,
})

MAX_LANES = 6
ID_RE = re.compile(r'([A-Za-z][A-Za-z0-9_]*)')
NODE_SHAPES = [
    (re.compile(r'^\[\["?(.*?)"?\]\]'), "external"),
    (re.compile(r'^\("?(.*?)"?\)'), "rounded"),
    (re.compile(r'^\["?(.*?)"?\]'), "process"),
]
DECISION_RE = re.compile(r'^\{"?(.*?)"?\}')
CLASS_TYPE = {"external": "external", "backend": "backend", "back": "backend"}


def parse_mermaid(src):
    nodes, order, edges = {}, [], []
    lanes = []
    lane_stack = []
    default_lane = None

    def ensure(nid, label=None, ntype=None, shape=None):
        if nid not in nodes:
            nodes[nid] = {"id": nid, "type": "process", "shape": "rect", "label": [nid]}
            order.append(nid)
            lane = lane_stack[-1] if lane_stack else None
            if lane is None:
                nonlocal default_lane
                if default_lane is None:
                    default_lane = {"title": "其他", "ids": []}
                    lanes.append(default_lane)
                lane = default_lane
            if nid not in lane["ids"]:
                lane["ids"].append(nid)
            nodes[nid]["_lane"] = id(lane)
        if label is not None:
            nodes[nid]["label"] = [l.strip() for l in label.split("<br>") if l.strip()]
        if ntype is not None:
            nodes[nid]["type"] = ntype
        if shape is not None:
            nodes[nid]["shape"] = shape

    def eat_node(chunk):
        m = ID_RE.match(chunk)
        if not m:
            return None
        nid = m.group(1)
        rest = chunk[m.end():]
        if DECISION_RE.match(rest):
            raise SystemExit("错误：架构图不支持判断菱形节点 %s（形态超限，请改用 mermaid 原生渲染）" % nid)
        for rx, shape in NODE_SHAPES:
            sm = rx.match(rest)
            if sm:
                ensure(nid, sm.group(1), "external" if shape == "external" else None, shape)
                return nid
        ensure(nid)
        return nid

    for raw in src.splitlines():
        line = raw.strip()
        if (not line or line.startswith("%%") or line.startswith("flowchart")
                or line.startswith("graph") or line.startswith("classDef")
                or line.startswith("direction")):
            continue
        if line.startswith("subgraph"):
            m = re.match(r'^subgraph\s*(.*?)\s*$', line)
            title = (m.group(1) if m else "").strip() or ""
            lanes.append({"title": title, "ids": []})
            lane_stack.append(lanes[-1])
            continue
        if line.startswith("end"):
            if lane_stack:
                lane_stack.pop()
            continue
        cm = re.match(r'^class\s+([\w,\s]+?)\s+(\w+);?$', line)
        if cm:
            t = CLASS_TYPE.get(cm.group(2).lower())
            if t:
                for nid in [x.strip() for x in cm.group(1).split(",")]:
                    ensure(nid)
                    nodes[nid]["type"] = t
            continue
        if "-->" in line or "-.->" in line:
            parts = re.split(r'\s*(?:-->|-\.->)\s*', line)
            for i in range(len(parts) - 1):
                left, right = parts[i], parts[i + 1]
                label = ""
                lm = re.match(r'^\|(.*?)\|\s*(.*)$', right)
                if lm:
                    label, right = lm.group(1), lm.group(2)
                a = eat_node(left.strip())
                b = eat_node(right.strip())
                if a and b:
                    edges.append({"from": a, "to": b,
                                  "label": [l for l in label.split("<br>") if l]})
            continue
        eat_node(line)

    # 空 subgraph（无节点）允许存在但去掉；全部节点单泳道时默认泳道即唯一泳道
    lanes = [l for l in lanes if l["ids"]]
    lane_of = {}
    for nid in nodes:
        n = nodes[nid]
        # 用 _lane id 映射到最终泳道对象
        for li, l in enumerate(lanes):
            if id(l) == n["_lane"]:
                lane_of[nid] = li
                break
        else:
            raise SystemExit("错误：节点 %s 的泳道丢失（形态超限）" % nid)
    for n in nodes.values():
        n.pop("_lane", None)
    return {"spec": SPEC_VERSION, "nodes": [nodes[i] for i in order],
            "edges": edges, "lanes": lanes, "lane_of": lane_of}


def load_spec(path):
    text = open(path, encoding="utf-8").read()
    return parse_mermaid(text)


def iter_labels(spec):
    for n in spec["nodes"]:
        for l in n["label"]:
            yield l
    for e in spec["edges"]:
        for l in e.get("label", []):
            yield l
    for lane in spec["lanes"]:
        if lane.get("title"):
            yield lane["title"]


def _node_size(n, st):
    fs = st["fs_node"]
    widths = [text_width(l, fs) for l in n["label"]]
    tw = max(widths) if widths else 40
    w = max(90, tw + 30)
    h = max(32, len(n["label"]) * (fs + 5) + 18)
    return round(w / 2) * 2, round(h / 2) * 2


def _place(spec, st):
    lanes = [dict(l) for l in spec["lanes"]]
    lane_of = dict(spec["lane_of"])
    edges = [dict(e) for e in spec["edges"]]
    N = {}
    for n in spec["nodes"]:
        nd = dict(n)
        nd["w"], nd["h"] = _node_size(nd, st)
        N[nd["id"]] = nd
    if len(lanes) > MAX_LANES:
        raise SystemExit("错误：泳道数 %d 超过上限 %d（形态超限）" % (len(lanes), MAX_LANES))

    warnings = []
    skips = []
    for e in edges:
        a, b = N[e["from"]], N[e["to"]]
        li, lj = lane_of[e["from"]], lane_of[e["to"]]
        if li == lj:
            ids = lanes[li]["ids"]
            ia, ib = ids.index(e["from"]), ids.index(e["to"])
            if abs(ia - ib) == 1:
                e["kind"] = "adj"
                e["up"] = ia < ib
            else:
                e["kind"] = "skip"   # 泳道内跳级边：走顶部走廊
                skips.append(e)
        elif abs(li - lj) == 1:
            e["kind"] = "bus"        # 相邻泳道：走共享垂直总线
        else:
            e["kind"] = "skip"       # 跨多泳道边：走顶部走廊
            skips.append(e)

    # 顶部走廊：每条跳级边一条（14px 高），按泳道跨度升序（嵌套跨度零交叉）
    margin = 20 + 14 * len(skips)
    fs = st["fs_node"]
    lane_w = []
    for l in lanes:
        ws = [N[i]["w"] for i in l["ids"]] or [60]
        lane_w.append(max(ws))
    n_gaps = max(0, len(lanes) - 1)
    gaps = [st["gap_base"]] * n_gaps
    lane_x = []
    x = margin
    for i, w in enumerate(lane_w):
        lane_x.append(x + w / 2)
        x += w + (gaps[i] if i < n_gaps else 0)
    W = round(x - (gaps[-1] if gaps else 0) + margin)

    title_h = 26
    y_top = margin + title_h + 14
    for l in lanes:
        y = y_top
        for k, nid in enumerate(l["ids"]):
            n = N[nid]
            if k:
                prev = N[l["ids"][k - 1]]
                y = prev["y"] + prev["h"] / 2 + 30 + n["h"] / 2
            n["y"] = y
    for nid, n in N.items():
        n["x"] = lane_x[lane_of[nid]]
    H = round(max(n["y"] + n["h"] / 2 for n in N.values()) + margin + 10)

    # 泳道间垂直总线：gap 中点；每条边的水平段走各自端口错位 y，垂直段共享总线。
    bus_x = {}
    for g in range(n_gaps):
        bus_x[g] = (lane_x[g] + lane_w[g] / 2 + lane_x[g + 1] - lane_w[g + 1] / 2) / 2

    skips_sorted = sorted(skips, key=lambda e: (abs(lane_of[e["from"]] - lane_of[e["to"]]),
                                                min(N[e["from"]]["y"], N[e["to"]]["y"])))
    skip_y = {id(e): 8 + 14 * k + 7 for k, e in enumerate(skips_sorted)}

    side_use = {}
    for e in edges:
        li, lj = lane_of[e["from"]], lane_of[e["to"]]
        if e["kind"] == "bus":
            side = "R" if li < lj else "L"
            side_use.setdefault((e["from"], side), []).append(id(e))
        elif e["kind"] == "skip":
            a, b = N[e["from"]], N[e["to"]]
            if li != lj:
                side_src = "R" if li < lj else "L"
                side_tgt = "L" if li < lj else "R"
            else:
                if li < n_gaps:
                    side_src = "R"
                    side_tgt = "L" if li > 0 else "R"
                else:
                    side_src = "L"
                    side_tgt = "R"
            side_use.setdefault((e["from"], side_src), []).append(id(e))
            side_use.setdefault((e["to"], side_tgt), []).append(id(e))
    port_off = {}
    for (nid, side), ids in side_use.items():
        n = len(ids)
        for k, eid in enumerate(ids):
            port_off[eid] = (k - (n - 1) / 2) * 8

    routes = []
    for e in edges:
        a, b = N[e["from"]], N[e["to"]]
        if e["kind"] == "adj":
            if e["up"]:  # a 在上、边向下：a 底端口 → b 顶端口
                pts = [(a["x"], a["y"] + a["h"] / 2), (b["x"], b["y"] - b["h"] / 2)]
            else:        # a 在下、边向上：a 顶端口 → b 底端口
                pts = [(a["x"], a["y"] - a["h"] / 2), (b["x"], b["y"] + b["h"] / 2)]
            lx, ly = a["x"] + a["w"] / 2 + 10, (pts[0][1] + pts[1][1]) / 2
            routes.append({"pts": pts, "label": e.get("label", []), "lx": lx, "ly": ly,
                           "anchor": "start", "arrow": True})
            continue
        li, lj = lane_of[e["from"]], lane_of[e["to"]]
        off = port_off.get(id(e), 0)
        if e["kind"] == "bus":
            bx = bus_x[min(li, lj)]
            if li < lj:
                sx, sy = port(a, "R")
                tx, ty = port(b, "L")
            else:
                sx, sy = port(a, "L")
                tx, ty = port(b, "R")
            sy += off
            ty -= off
            pts = [(sx, sy), (bx, sy), (bx, ty), (tx, ty)]
            routes.append({"pts": pts, "label": e.get("label", []),
                           "lx": (sx + bx) / 2, "ly": sy - 8,
                           "anchor": "middle", "arrow": True})
            continue
        # skip：顶部走廊路由（源侧 bus 上探 → 走廊横移 → 目标侧 bus 下探）
        yc = skip_y[id(e)]
        if li < lj:
            up_gap, down_gap = li, lj - 1
            sx, sy = port(a, "R")
            tx, ty = port(b, "L")
        elif lj < li:
            up_gap, down_gap = li - 1, lj
            sx, sy = port(a, "L")
            tx, ty = port(b, "R")
        else:
            if li < n_gaps:
                up_gap = li
                down_gap = li - 1 if li > 0 else li
                sx, sy = port(a, "R")
                tx, ty = port(b, "L") if down_gap < li else port(b, "R")
            else:
                up_gap = down_gap = li - 1
                sx, sy = port(a, "L")
                tx, ty = port(b, "R")
        sy += off
        ty -= off
        b1, b2 = bus_x[up_gap], bus_x[down_gap]
        if b1 == b2:
            pts = [(sx, sy), (b1, sy), (b1, yc), (b2, ty), (tx, ty)]
        else:
            pts = [(sx, sy), (b1, sy), (b1, yc), (b2, yc), (b2, ty), (tx, ty)]
        routes.append({"pts": pts, "label": e.get("label", []),
                       "lx": (sx + b1) / 2, "ly": sy - 8,
                       "anchor": "middle", "arrow": True})

    crossings = ortho_crossings(routes)
    boxes = [(nid, n["x"], n["y"], n["w"], n["h"]) for nid, n in N.items()]
    title_boxes = []
    for i, l in enumerate(lanes):
        tw = text_width(l["title"], st["fs_section"]) if l["title"] else 0
        title_boxes.append(("lane-title-%d" % i, lane_x[i], margin + 10, tw, 16))
    overlaps = box_overlaps(boxes + title_boxes)
    overflow = text_overflow_check(N, [n["id"] for n in spec["nodes"]],
                                   lambda n, j: (fs, n["w"] - 10))
    for i, l in enumerate(lanes):
        if not l["title"]:
            continue
        need = text_width(l["title"], st["fs_section"])
        avail = lane_w[i] + 8
        if need > avail:
            overflow.append({"id": "lane-title-%d" % i, "line": 0, "text": l["title"],
                             "need": round(need), "avail": round(avail)})
    return {"nodes": N, "order": [n["id"] for n in spec["nodes"]], "routes": routes,
            "lanes": lanes, "lane_of": lane_of, "lane_x": lane_x, "lane_w": lane_w,
            "extra": {"title_y": margin + 10, "y_top": y_top, "bottom": H - margin - 10,
                      "band_top": margin - 4},
            "W": W, "H": H, "style": st,
            "crossings": crossings, "overlaps": overlaps,
            "textOverflow": overflow, "warnings": warnings}


def layout(spec, style=None, args=None):
    st = dict(STYLE)
    if style:
        st.update(style)
    return _place(spec, st)


def render_svg(lay, title=""):
    st = lay["style"]
    out = svg_open(lay["W"], lay["H"], DATA_ATTR, st)
    out.append(arrow_marker(st))
    for i, l in enumerate(lay["lanes"]):
        x0 = lay["lane_x"][i] - lay["lane_w"][i] / 2 - 12
        w = lay["lane_w"][i] + 24
        out.append('<g class="lane" id="arch-lane-%d">' % i)
        out.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s" stroke="%s" '
                   'stroke-width="0.8" stroke-dasharray="4 4" rx="6"/>'
                   % (x0, lay["extra"]["band_top"], w, lay["extra"]["bottom"] - lay["extra"]["band_top"],
                      st["band_fill"], st["band_stroke"]))
        if l["title"]:
            out.append('<text x="%g" y="%g" font-size="%d" fill="%s" text-anchor="middle" '
                       'class="lane-title">%s</text>'
                       % (lay["lane_x"][i], lay["extra"]["title_y"], st["fs_section"],
                          st["band_text"], esc(l["title"])))
        out.append('</g>')
    for r in lay["routes"]:
        p = " ".join("%g,%g" % (x, y) for x, y in r["pts"])
        m = ' marker-end="url(#arw)"' if r["arrow"] else ""
        out.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="1.5"%s/>'
                   % (p, st["edge_color"], m))
        if r["label"] and r["lx"] is not None:
            for k, t in enumerate(r["label"]):
                out.append('<text x="%g" y="%g" font-size="%d" fill="%s" text-anchor="%s">%s</text>'
                           % (r["lx"], r["ly"] + k * 13, st["fs_label"], st["label_color"],
                              r["anchor"], esc(t)))
    for i, nid in enumerate(lay["order"]):
        n = lay["nodes"][nid]
        cx, cy, w, h, typ, shape = n["x"], n["y"], n["w"], n["h"], n["type"], n["shape"]
        out.append('<g class="node" id="arch-%s-%d" data-node="%s">' % (nid, i, nid))
        if shape == "external":
            out.append('<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="%s" stroke="%s" '
                       'stroke-width="1.3" stroke-dasharray="5 4"/>'
                       % (cx - w / 2, cy - h / 2, w, h, st["fill_external"], st["stroke_external"]))
        elif typ == "backend":
            out.append('<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="%s" stroke="%s" stroke-width="1.3"/>'
                       % (cx - w / 2, cy - h / 2, w, h, st["fill_backend"], st["stroke_backend"]))
            for dx in (cx - w / 2 + 5, cx + w / 2 - 5):
                out.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-width="1.2"/>'
                           % (dx, cy - h / 2, dx, cy + h / 2, st["stroke_backend"]))
        else:
            rx = 8 if shape == "rounded" else 4
            out.append('<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" stroke="%s" stroke-width="1.4"/>'
                       % (cx - w / 2, cy - h / 2, w, h, rx, st["fill"], st["stroke"]))
        nl = len(n["label"])
        for j, t in enumerate(n["label"]):
            ty = cy + (j - (nl - 1) / 2) * (st["fs_node"] + 4) + st["fs_node"] * 0.35
            out.append(svg_text(cx, ty, st["fs_node"], st["text"], "middle", t))
        out.append('</g>')
    out += svg_close()
    return "\n".join(out)


def render_html(lay, title):
    return _render_html(render_svg(lay, title), title, lay["style"]["font_family"])


def main_cli(args):
    return common_main(args, sys.modules[__name__])


if __name__ == "__main__":
    ap = common_argparse("flow-canvas 架构图布局器（archspec/1）")
    raise SystemExit(main_cli(ap.parse_args()))
