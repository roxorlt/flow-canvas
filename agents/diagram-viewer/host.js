// diagram-viewer Host 半部（cordis_define code.host 函数体，与 diagr-1/pkg-4 一致）。
// 运行环境：DSH 动态插件。依赖 Builtin：ctx / harness / console。
// 依赖 Service：subprocess（可选 sandboxPolicy 仅作兜底）。
return {
  apply(ctx) {
    const subprocess = ctx.get('subprocess')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    if (subprocess === undefined) return

    let wsRoot = null
    try {
      if (sandboxPolicy && sandboxPolicy.workspaceRoot) wsRoot = String(sandboxPolicy.workspaceRoot)
    } catch (e) { /* ignore */ }
    const outRel = '.diagrams'
    const engineRels = [
      './.worktrees/feat-multi-type-layout/scripts/flowlayout.py',
      './scripts/flowlayout.py',
    ]
    let resolved = null // { engine, outDir }

    async function runChecked(argv, opts, cwd) {
      const spec = {
        argv: argv,
        cwd: cwd || '.',
        stdio: {
          stdin: opts && opts.stdinData ? { data: opts.stdinData } : 'ignore',
          stdout: { maxBytes: 300000, spill: { maxBytes: 600000 } },
          stderr: { maxBytes: 30000, spill: { maxBytes: 60000 } },
        },
        graceMs: 30000,
      }
      if (opts && opts.signal) spec.signal = opts.signal
      const handle = subprocess.spawn(spec)
      const outcome = await handle.done
      const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
      const err = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
      return { exitCode: outcome.exitCode, out: out, err: err }
    }

    function probeExec(exec) {
      const info = {}
      try {
        if (exec && exec.agent) {
          const a = exec.agent
          if (a.cwd !== undefined) info.agentCwd = String(a.cwd)
          if (a.header && a.header.cwd !== undefined) info.agentHeaderCwd = String(a.header.cwd)
          if (a.session && a.session.cwd !== undefined) info.sessionCwd = String(a.session.cwd)
          if (a.session && a.session.header && a.session.header.cwd !== undefined) info.sessionHeaderCwd = String(a.session.header.cwd)
        }
      } catch (e) { info.probeError = String(e) }
      return info
    }

    async function resolveEngine(exec) {
      if (resolved !== null) return resolved
      const tried = []
      // 1) pwd 探测：harness 进程 cwd 即会话工作区
      try {
        const pwd = await runChecked(['/bin/pwd'], {})
        const abs = (pwd.out || '').trim()
        if (abs) {
          for (const rel of engineRels) {
            const p = abs + rel.slice(1)
            const r = await runChecked(['/bin/sh', '-c', 'test -f "$1" && grep -q -- "--type" "$1"', 'sh', p], {}, abs)
            tried.push(p + ' -> ' + r.exitCode)
            if (r.exitCode === 0) { resolved = { engine: p, outDir: abs + '/' + outRel }; return resolved }
          }
        }
      } catch (e) { tried.push('pwd-probe-error: ' + String(e)) }
      // 2) exec.agent 的 cwd 线索
      const info = probeExec(exec)
      const cwdHints = [info.agentCwd, info.agentHeaderCwd, info.sessionCwd, info.sessionHeaderCwd]
        .filter(function (s) { return typeof s === 'string' && s.length > 0 })
      for (const cwd of cwdHints) {
        for (const rel of ['./scripts/flowlayout.py', './.worktrees/feat-multi-type-layout/scripts/flowlayout.py']) {
          const p = cwd + '/' + rel.slice(2)
          const r = await runChecked(['/bin/sh', '-c', 'test -f "$1" && grep -q -- "--type" "$1"', 'sh', p], {}, cwd)
          tried.push(p + ' -> ' + r.exitCode)
          if (r.exitCode === 0) { resolved = { engine: p, outDir: cwd + '/' + outRel }; return resolved }
        }
      }
      // 3) sandboxPolicy.workspaceRoot 兜底（含常见变体）
      if (wsRoot) {
        const bases = [wsRoot, wsRoot + '/Desktop/work/flow-canvas', wsRoot + '/work/flow-canvas']
        for (const b of bases) {
          for (const rel of ['/scripts/flowlayout.py', '/.worktrees/feat-multi-type-layout/scripts/flowlayout.py']) {
            const p = b + rel
            const r = await runChecked(['/bin/sh', '-c', 'test -f "$1" && grep -q -- "--type" "$1"', 'sh', p], {}, b)
            tried.push(p + ' -> ' + r.exitCode)
            if (r.exitCode === 0) { resolved = { engine: p, outDir: b + '/' + outRel }; return resolved }
          }
        }
      }
      throw new Error('引擎不可用。cwd 线索: ' + JSON.stringify(info) + ' 候选: ' + tried.join(' | '))
    }

    function slugify(title, type, mermaid) {
      let s = String(title || '').replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      if (!s) {
        let h = 5381
        for (let i = 0; i < mermaid.length; i++) h = ((h << 5) + h + mermaid.charCodeAt(i)) >>> 0
        s = 'diagram-' + type + '-' + h.toString(36).slice(0, 8)
      }
      return s
    }

    harness.handle('load-diagram', async (args) => {
      const slug = String(args.slug || '').replace(/[^A-Za-z0-9_\u4e00-\u9fff-]/g, '').slice(0, 60)
      if (!slug) throw new Error('bad slug')
      if (resolved === null) throw new Error('插件尚未解析引擎路径')
      const r = await runChecked(['/bin/cat', slug + '.svg'], {}, resolved.outDir)
      if (r.exitCode !== 0) throw new Error('读取产物失败：' + (r.err || ('退出码 ' + r.exitCode)))
      return { svg: r.out }
    })

    const tool = harness.defineTool({
      name: 'diagram_render',
      description: '用 flow-canvas 确定性排版引擎把 mermaid 子集渲染为规范 SVG（flowchart 流程图 / arch 架构图 / er ER 图 / gantt 甘特图 / seq 时序图），落盘到 <工作区>/.diagrams/<slug>.svg 并返回检查报告。引擎保证交叉/重叠/文字溢出全为 0；形态超限时返回降级错误，此时应改用 mermaid 原生渲染，不要对同一输入重复调用。',
      parameters: {
        mermaid: { type: 'string', required: true, description: 'mermaid 源码文本（flowchart 子集 / erDiagram / gantt / sequenceDiagram）' },
        type: { type: 'string', required: true, enum: ['flowchart', 'arch', 'er', 'gantt', 'seq'], description: '图类型' },
        title: { type: 'string', description: '可选标题，同时用作产物文件名 slug' },
        html: { type: 'boolean', description: '为真时额外产出可缩放拖拽的单文件 HTML 画布' },
        style: { type: 'json', description: '可选样式覆盖对象（对应引擎 --style 的 JSON 键）' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            degraded: { type: 'boolean' },
            slug: { type: 'string' },
            svgPath: { type: 'string' },
            htmlPath: { type: 'string' },
            report: { type: 'json' },
            error: { type: 'string' },
          },
        },
        render(args, value) {
          if (!value.ok) {
            return [{ type: 'text', text: 'diagram_render 降级：' + (value.error || '引擎不可用') + '。请改用 mermaid 原生渲染交付，不要对同一输入重复调用本工具。' }]
          }
          return [{ type: 'text', text: JSON.stringify({ slug: value.slug, type: args.type, svgPath: value.svgPath, report: value.report }) }]
        },
      },
      timeoutMs: 60000,
      isConcurrencySafe: function () { return true },
      execute: async function (args, exec) {
        const slug = slugify(args.title, args.type, args.mermaid)
        try {
          const loc = await resolveEngine(exec)
          const mk = await runChecked(['/bin/mkdir', '-p', loc.outDir], {})
          if (mk.exitCode !== 0) {
            return { ok: false, degraded: true, slug: slug, svgPath: '', htmlPath: '', report: null, error: '创建产物目录失败：' + (mk.err || mk.exitCode) }
          }
          const wr = await runChecked(['/bin/sh', '-c', 'cat > "$1"', 'sh', slug + '.mmd'], { stdinData: args.mermaid }, loc.outDir)
          if (wr.exitCode !== 0) {
            return { ok: false, degraded: true, slug: slug, svgPath: '', htmlPath: '', report: null, error: '写入输入文件失败：' + (wr.err || wr.exitCode) }
          }
          const svgName = slug + '.svg'
          const htmlName = slug + '.html'
          const argv = [loc.engine, slug + '.mmd', '--type', args.type, '-o', args.html ? htmlName : svgName]
          if (args.title) argv.push('--title', String(args.title))
          if (args.html) argv.push('--html')
          if (args.style && typeof args.style === 'object') {
            await runChecked(['/bin/sh', '-c', 'cat > "$1"', 'sh', slug + '.style.json'], { stdinData: JSON.stringify(args.style) }, loc.outDir)
            argv.push('--style', slug + '.style.json')
          }
          const r = await runChecked(argv, { signal: exec.signal }, loc.outDir)
          if (exec.signal && exec.signal.aborted) {
            return { ok: false, degraded: true, slug: slug, svgPath: loc.outDir + '/' + svgName, htmlPath: '', report: null, error: '渲染被取消' }
          }
          if (r.exitCode !== 0) {
            const msg = (r.err || r.out || '引擎退出码 ' + r.exitCode).trim()
            return { ok: false, degraded: true, slug: slug, svgPath: loc.outDir + '/' + svgName, htmlPath: '', report: null, error: msg.slice(0, 2000) }
          }
          const lines = r.out.split('\n')
          const jsonLine = lines.find(function (l) { return l.trim().charAt(0) === '{' })
          let report = null
          if (jsonLine !== undefined) { try { report = JSON.parse(jsonLine) } catch (e) { report = null } }
          if (!report || report.crossings !== 0 || report.overlaps !== 0 || report.textOverflow !== 0) {
            return { ok: false, degraded: true, slug: slug, svgPath: loc.outDir + '/' + svgName, htmlPath: '', report: report, error: '布局检查未通过（交叉 ' + (report ? report.crossings : '?') + ' / 重叠 ' + (report ? report.overlaps : '?') + ' / 文字溢出 ' + (report ? report.textOverflow : '?') + '），已拒绝产出，请降级为 mermaid 原生渲染' }
          }
          return { ok: true, degraded: false, slug: slug, svgPath: loc.outDir + '/' + svgName, htmlPath: args.html ? loc.outDir + '/' + htmlName : '', report: report }
        } catch (e) {
          return { ok: false, degraded: true, slug: slug, svgPath: '', htmlPath: '', report: null, error: String(e && e.message ? e.message : e).slice(0, 2000) }
        }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, tool), 'diagram-viewer: tool')
  },
}
