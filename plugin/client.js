// dsh-diagram-viewer Client 半部：diagram_render 工具卡片（对话流内联 SVG）。
// 打包客户端模块（__ModuleLoader__ 自注册），数据经工具 output.presentationMeta
// 由 block.meta 直通，无需 Host RPC。缩放/拖拽/适宽，CSS 跟随深浅主题。
window.__ModuleLoader__.load({
  id: 'dsh-diagram-viewer',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

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
      '.dv-view:fullscreen{display:flex;flex-direction:column;width:100vw;height:100vh;background:var(--dsw-alias-bg-base,#fff);border:none;border-radius:0;}',
      '.dv-view:fullscreen .dv-bar{flex:none;}',
      '.dv-view:fullscreen .dv-canvas{flex:1;height:auto;max-height:none;background:#fbfbfb;}',
      '@media (prefers-color-scheme: dark){.dv-canvas{background:#171717;}.dv-svg svg{filter:invert(0.92) hue-rotate(180deg);}.dv-view:fullscreen .dv-canvas{background:#171717;}}',
    ].join('\n')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin="dsh-diagram-viewer"]') !== null) return
      const el = document.createElement('style')
      el.dataset.plugin = 'dsh-diagram-viewer'
      el.textContent = DIAGRAM_CSS
      document.head.appendChild(el)
    }

    function Viewer(props) {
      const [zoom, setZoom] = React.useState(1)
      const [pan, setPan] = React.useState({ x: 0, y: 0 })
      const [fit, setFit] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const [fullscreen, setFullscreen] = React.useState(false)
      const wrapRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const dragRef = React.useRef(null)

      React.useEffect(() => {
        const el = canvasRef.current
        if (!el) return
        const onWheel = (e) => {
          // 触控板双指滚动（无 ctrlKey）交还给页面滚动；只有 pinch / ctrl+滚轮才缩放
          if (!e.ctrlKey) return
          e.preventDefault()
          setZoom((z) => Math.min(4, Math.max(0.2, z * (e.deltaY < 0 ? 1.12 : 0.89))))
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
      }, [])

      // 全屏切换：进入/退出都重置适屏状态，按新视口重新「完整包含」
      React.useEffect(() => {
        const onChange = () => {
          const active = document.fullscreenElement === wrapRef.current
          setFullscreen(active)
          setPan({ x: 0, y: 0 })
          setFit(false)
        }
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
      }, [])

      React.useEffect(() => {
        const el = canvasRef.current
        if (!el || fit) return
        const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(props.svg || '')
        if (!m) return
        const w = parseFloat(m[1])
        const h = parseFloat(m[2])
        if (!(w > 0 && h > 0)) return
        // 初始「完整包含」：宽高都适配，整图可见，且不超过 100% 放大
        const zf = el.clientWidth > 0 ? (el.clientWidth - 24) / w : 1
        const zh = el.clientHeight > 0 ? (el.clientHeight - 24) / h : 1
        setZoom(Math.min(1, zf, zh))
        setFit(true)
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
      const toggleFullscreen = () => {
        const el = wrapRef.current
        if (!el) return
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {})
        }
      }
      const copyMermaid = () => {
        const text = props.mermaid
        if (!text) return
        const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
        const fallback = () => {
          try {
            const ta = document.createElement('textarea')
            ta.value = text
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
            done()
          } catch { /* 忽略复制失败 */ }
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(fallback)
        } else {
          fallback()
        }
      }

      return React.createElement('div', { className: 'dv-view', 'data-tool': 'diagram_render', ref: wrapRef },
        React.createElement('div', { className: 'dv-bar' },
          React.createElement('span', { className: 'dv-title' }, 'diagram_render'),
          React.createElement('button', { className: 'dv-btn', onClick: () => zoomBy(0.8) }, '−'),
          React.createElement('span', { className: 'dv-zoom' }, Math.round(zoom * 100) + '%'),
          React.createElement('button', { className: 'dv-btn', onClick: () => zoomBy(1.25) }, '+'),
          React.createElement('button', { className: 'dv-btn', onClick: reset }, '重置'),
          props.mermaid ? React.createElement('button', { className: 'dv-btn', onClick: copyMermaid }, copied ? '已复制' : '复制 mermaid') : null,
          typeof document !== 'undefined' && document.fullscreenEnabled ? React.createElement('button', { className: 'dv-btn', onClick: toggleFullscreen }, fullscreen ? '退出全屏' : '全屏') : null,
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
      const meta = settled && 'meta' in block && block.meta && typeof block.meta === 'object' ? block.meta : null
      if (!settled) {
        return React.createElement('div', { className: 'dv-card', 'data-tool': 'diagram_render' },
          React.createElement('span', { className: 'dv-title' }, 'diagram_render'),
          React.createElement('span', { className: 'dv-hint' }, '渲染中…'),
        )
      }
      if (meta === null || typeof meta.svg !== 'string' || meta.svg === '') {
        return React.createElement('div', { className: 'dv-card dv-error', 'data-tool': 'diagram_render' },
          React.createElement('span', { className: 'dv-title' }, 'diagram_render'),
          React.createElement('span', { className: 'dv-hint' }, (meta && meta.error) || '渲染失败'),
        )
      }
      return React.createElement(Viewer, { svg: meta.svg, svgPath: meta.svgPath, mermaid: meta.mermaid })
    }

    function apply(ctx) {
      ensureCss()
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
        { name: 'tool.call.toolview', key: 'diagram_render' },
        DiagramRow,
      ))
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
