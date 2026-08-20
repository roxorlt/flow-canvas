// diagram-viewer Client 半部（cordis_define code.client 函数体，与 diagr-1/pkg-4 一致）。
// 运行环境：浏览器页面。依赖 Builtin：ctx / React / host / styles / console。
const DIAGRAM_CSS = [
  '.dv-card{border:1px solid var(--dsw-alias-border-l1,#e0e0e0);border-radius:8px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1,#fff);font-size:12px;display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary,#888);}',
  '.dv-title{font-weight:600;color:var(--dsw-alias-label-primary,#333);}',
  '.dv-hint{color:var(--dsw-alias-label-secondary,#888);}',
  '.dv-error .dv-hint{color:var(--dsw-alias-state-error-primary,#c0392b);}',
  '.dv-view{border:1px solid var(--dsw-alias-border-l1,#e0e0e0);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff);}',
  '.dv-bar{display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l1,#e0e0e0);color:var(--dsw-alias-label-secondary,#888);}',
  '.dv-bar .dv-title{margin-right:auto;}',
  '.dv-btn{border:1px solid var(--dsw-alias-border-l2,#c8c8c8);background:transparent;color:var(--dsw-alias-label-primary,#333);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px;line-height:1.6;}',
  '.dv-btn:hover{background:var(--dsw-alias-bg-layer-2,#f2f2f2);}',
  '.dv-zoom{min-width:38px;text-align:center;}',
  '.dv-canvas{height:360px;max-height:60vh;overflow:hidden;cursor:grab;touch-action:none;position:relative;background:#fbfbfb;}',
  '.dv-canvas:active{cursor:grabbing;}',
  '.dv-stage{transform-origin:0 0;will-change:transform;}',
  '.dv-svg svg{display:block;height:auto;max-width:none;}',
  '@media (prefers-color-scheme: dark){.dv-canvas{background:#171717;}.dv-svg svg{filter:invert(0.92) hue-rotate(180deg);}}',
].join('\n')

function resultText(block) {
  if (!('kind' in block)) return null
  const parts = []
  for (const item of block.content) parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  return parts.join('\n') || null
}

function parseMeta(block) {
  const text = resultText(block)
  if (!text) return null
  try {
    const d = JSON.parse(text)
    return d && typeof d.slug === 'string' ? d : null
  } catch (e) { return null }
}

function Viewer(props) {
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [fit, setFit] = React.useState(false)
  const canvasRef = React.useRef(null)
  const dragRef = React.useRef(null)

  React.useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      setZoom((z) => Math.min(4, Math.max(0.2, z * (e.deltaY < 0 ? 1.12 : 0.89))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  React.useEffect(() => {
    const el = canvasRef.current
    if (!el || fit) return
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(props.svg || '')
    if (!m) return
    const w = parseFloat(m[1])
    if (w > 0 && el.clientWidth > 0) { setZoom(Math.min(1, (el.clientWidth - 24) / w)); setFit(true) }
  }, [props.svg, fit])

  const onPointerDown = (e) => { dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y } }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    setPan({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy })
  }
  const onPointerUp = () => { dragRef.current = null }
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }
  const zoomBy = (f) => setZoom((z) => Math.min(4, Math.max(0.2, z * f)))

  return React.createElement('div', { className: 'dv-view', 'data-tool': 'diagram_render' },
    React.createElement('div', { className: 'dv-bar' },
      React.createElement('span', { className: 'dv-title' }, 'diagram_render'),
      React.createElement('button', { className: 'dv-btn', onClick: () => zoomBy(0.8) }, '−'),
      React.createElement('span', { className: 'dv-zoom' }, Math.round(zoom * 100) + '%'),
      React.createElement('button', { className: 'dv-btn', onClick: () => zoomBy(1.25) }, '+'),
      React.createElement('button', { className: 'dv-btn', onClick: reset }, '重置'),
      props.openFile ? React.createElement('button', { className: 'dv-btn', onClick: () => props.openFile(props.svgPath) }, '打开文件') : null,
    ),
    React.createElement('div', {
      className: 'dv-canvas', ref: canvasRef,
      onPointerDown: onPointerDown, onPointerMove: onPointerMove,
      onPointerUp: onPointerUp, onPointerLeave: onPointerUp,
    },
      React.createElement('div', {
        className: 'dv-stage',
        style: { transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')' },
      },
        React.createElement('div', { className: 'dv-svg', dangerouslySetInnerHTML: { __html: props.svg } }),
      ),
    ),
  )
}

function DiagramRow(props) {
  const block = props.block
  const settled = 'kind' in block
  const [state, setState] = React.useState({ status: 'running', svg: null })
  const meta = settled ? parseMeta(block) : null
  const errorText = settled && meta === null ? (resultText(block) || '渲染失败').split('\n')[0] : null

  React.useEffect(() => {
    if (!settled) return
    let cancelled = false
    if (meta === null) { setState({ status: 'error', svg: null }); return }
    host.call('load-diagram', { slug: meta.slug }).then(
      (r) => {
        if (cancelled) return
        setState(r && typeof r.svg === 'string' ? { status: 'ok', svg: r.svg } : { status: 'error', svg: null })
      },
      () => { if (!cancelled) setState({ status: 'error', svg: null }) },
    )
    return () => { cancelled = true }
  }, [settled])

  if (!settled || state.status === 'running') {
    return React.createElement('div', { className: 'dv-card', 'data-tool': 'diagram_render' },
      React.createElement('span', { className: 'dv-title' }, 'diagram_render'),
      React.createElement('span', { className: 'dv-hint' }, '渲染中…'),
    )
  }
  if (state.status === 'error') {
    return React.createElement('div', { className: 'dv-card dv-error', 'data-tool': 'diagram_render' },
      React.createElement('span', { className: 'dv-title' }, 'diagram_render'),
      React.createElement('span', { className: 'dv-hint' }, errorText || '加载产物失败'),
    )
  }
  return React.createElement(Viewer, { svg: state.svg, svgPath: meta.svgPath, openFile: props.openFile })
}

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('tool.call.toolview', () => slots.register(
      { name: 'tool.call.toolview', key: 'diagram_render' },
      DiagramRow,
    ))
    ctx.effect(() => styles.insert(DIAGRAM_CSS), 'diagram-viewer: styles')
  },
}
