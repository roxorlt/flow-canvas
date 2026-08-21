// dsh-diagram-viewer Host 半部：diagram_render 模型工具。
// 打包插件（bundle）形态，加载方式见 cordis.patch.yml 与 README.md。
// 引擎：flow-canvas 多图类型排版引擎（本仓库 scripts/flowlayout.py + --type），
// 候选定位：DIAGRAM_ENGINE_PATH 环境变量 → 包内 ../scripts/（link 安装指向仓库）
// → ~/Desktop/work/flow-canvas/scripts/。产物落盘 <引擎所在仓库>/.diagrams/。
//
// 注意（重要）：ctx.tools.register 是底层入口，parameters 与 output.schema 必须
// 是标准 JSON Schema（type 只能是 object/array/string/number/integer/boolean/null，
// required 是数组；任意 JSON 用「不带 type 的注解节点」表示）。作者 DSL（type:'json'、
// required:true 内联）只有 defineTool() 编译器认。改动本文件后先跑 plugin/validate.mjs
// 再重启 dsh。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'diagram-viewer'
export const inject = ['tools']

const HERE = dirname(fileURLToPath(import.meta.url))
const MAX_ERROR = 2000

// { engine, workspace }：引擎路径 + 产物工作区（= 引擎所在仓库根，与启动 cwd 无关）
const ENGINE_CANDIDATES = [
  () => {
    const env = process.env.DIAGRAM_ENGINE_PATH
    if (!env) return null
    return { engine: env, workspace: process.env.DIAGRAM_WORKSPACE || process.cwd() }
  },
  () => {
    const engine = join(HERE, '../scripts/flowlayout.py')
    return { engine, workspace: resolve(dirname(engine), '..') }
  },
  () => {
    const engine = join(homedir(), 'Desktop/work/flow-canvas/scripts/flowlayout.py')
    return { engine, workspace: resolve(dirname(engine), '..') }
  },
]

let resolvedLoc = null

function resolveEngine() {
  if (resolvedLoc !== null) return resolvedLoc
  for (const candidate of ENGINE_CANDIDATES) {
    const loc = candidate()
    if (loc === null) continue
    try {
      if (existsSync(loc.engine) && readFileSync(loc.engine, 'utf8').includes('--type')) {
        resolvedLoc = loc
        break
      }
    } catch { /* try next */ }
  }
  if (resolvedLoc === null) {
    throw new Error('flow-canvas 引擎不可用（候选: ' + ENGINE_CANDIDATES.length + ' 个，可用 DIAGRAM_ENGINE_PATH 覆盖）')
  }
  return resolvedLoc
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

const TOOL = {
  name: 'diagram_render',
  description: '用 flow-canvas 确定性排版引擎把 mermaid 子集渲染为规范 SVG（flowchart 流程图 / arch 架构图 / er ER 图 / gantt 甘特图 / seq 时序图），落盘到 <工作区>/.diagrams/<slug>.svg 并返回检查报告。引擎保证交叉/重叠/文字溢出全为 0；形态超限时返回降级错误，此时应改用 mermaid 原生渲染，不要对同一输入重复调用。',
  parameters: {
    type: 'object',
    properties: {
      mermaid: { type: 'string', description: 'mermaid 源码文本（flowchart 子集 / erDiagram / gantt / sequenceDiagram）' },
      type: { type: 'string', enum: ['flowchart', 'arch', 'er', 'gantt', 'seq'], description: '图类型' },
      title: { type: 'string', description: '可选标题，同时用作产物文件名 slug' },
      html: { type: 'boolean', description: '为真时额外产出可缩放拖拽的单文件 HTML 画布' },
      style: { description: '可选样式覆盖对象（任意 JSON，对应引擎 --style 的 JSON 键）' },
    },
    required: ['mermaid', 'type'],
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
        report: { description: '引擎布局检查报告（JSON 对象，降级时可能为 null）' },
        svg: { type: 'string' },
        error: { type: 'string' },
      },
    },
    render(args, value) {
      if (!value.ok) {
        return [{ type: 'text', text: 'diagram_render 降级：' + (value.error || '引擎不可用') + '。请改用 mermaid 原生渲染交付，不要对同一输入重复调用本工具。' }]
      }
      return [{ type: 'text', text: JSON.stringify({ slug: value.slug, type: args.type, svgPath: value.svgPath, report: value.report }) }]
    },
    presentationMeta(_args, value) {
      return { slug: value.slug, svgPath: value.svgPath, report: value.report, svg: value.svg, error: value.error }
    },
  },
  timeoutMs: 60000,
  isConcurrencySafe() { return true },
  async execute(args) {
    const slug = slugify(args.title, args.type, args.mermaid)
    const loc = resolveEngine()
    const workspace = loc.workspace
    const outDir = join(workspace, '.diagrams')
    const svgPath = join(outDir, slug + '.svg')
    const htmlPath = join(outDir, slug + '.html')
    const base = { ok: false, degraded: true, slug, svgPath, htmlPath: args.html ? htmlPath : '', report: null, svg: '', error: '' }
    try {
      mkdirSync(outDir, { recursive: true })
      const inPath = join(outDir, slug + '.mmd')
      writeFileSync(inPath, args.mermaid, 'utf8')
      const argv = [loc.engine, inPath, '--type', args.type, '-o', args.html ? htmlPath : svgPath]
      if (args.title) argv.push('--title', String(args.title))
      if (args.html) argv.push('--html')
      if (args.style && typeof args.style === 'object') {
        const stylePath = join(outDir, slug + '.style.json')
        writeFileSync(stylePath, JSON.stringify(args.style), 'utf8')
        argv.push('--style', stylePath)
      }
      const r = spawnSync('python3', argv, { cwd: workspace, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
      if (r.error) {
        base.error = String(r.error).slice(0, MAX_ERROR)
        return base
      }
      const out = String(r.stdout || '')
      const err = String(r.stderr || '')
      if (r.status !== 0) {
        base.error = (err || out || ('引擎退出码 ' + r.status)).trim().slice(0, MAX_ERROR)
        return base
      }
      const jsonLine = out.split('\n').find((l) => l.trim().charAt(0) === '{')
      let report = null
      if (jsonLine !== undefined) {
        try { report = JSON.parse(jsonLine) } catch { report = null }
      }
      if (!report || report.crossings !== 0 || report.overlaps !== 0 || report.textOverflow !== 0) {
        base.report = report
        base.error = '布局检查未通过（交叉 ' + (report ? report.crossings : '?') + ' / 重叠 ' + (report ? report.overlaps : '?') + ' / 文字溢出 ' + (report ? report.textOverflow : '?') + '），已拒绝产出，请降级为 mermaid 原生渲染'
        return base
      }
      const svg = readFileSync(svgPath, 'utf8')
      return { ok: true, degraded: false, slug, svgPath, htmlPath: args.html ? htmlPath : '', report, svg, error: '' }
    } catch (e) {
      base.error = String(e && e.message ? e.message : e).slice(0, MAX_ERROR)
      return base
    }
  },
}

export function apply(ctx) {
  // 防御：注册失败只降级本插件（缺工具），绝不拖垮整个 dsh 启动。
  // 失败原因会打印到启动日志，搜索「dsh-diagram-viewer」即可定位。
  try {
    ctx.tools.register(TOOL)
  } catch (error) {
    console.error('dsh-diagram-viewer: 注册 diagram_render 失败，本插件降级为不可用（不影响 dsh 启动）:', error)
  }
}

export const diagramTool = TOOL
