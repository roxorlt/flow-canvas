#!/usr/bin/env node
// dsh-diagram-viewer 重启前验证（pre-restart gate）。
//
// 用法（从能解析 @deepseek-ai/dsh-tools 的目录运行，推荐 profile 根）：
//   cd ~/.dsh/profiles/web
//   node /Users/roxor/Desktop/work/flow-canvas/plugin/validate.mjs
//
// 检查项：
//   1. output.schema 过 dsh-tools 的真实启动校验器 assertSupportedJsonSchema
//      （就是 2026-08-20 把 dsh web 挂掉的那个闸门，type:'json' 之类会被它拒绝）；
//   2. parameters 结构检查：必须是标准 JSON Schema（对象根 + properties + required
//      数组；节点 type 只能是七个标准类型或 annotation-only；不允许 DSL 残留
//      required:true 内联、type:'json'）；
//   3. 端到端执行：真实跑一次引擎（seq 样例），断言 ok、质检全 0、SVG 非空。
// 全部通过才允许重启 dsh。
import { createRequire } from 'node:module'
import { diagramTool } from './host.js'

// 从 cwd（推荐 profile 根）解析 dsh-tools——与 loader 同一锚点
const require = createRequire(process.cwd() + '/')
const { assertSupportedJsonSchema } = require('@deepseek-ai/dsh-tools')

const JSON_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
let failures = 0

function fail(msg) {
  failures += 1
  console.error('FAIL ' + msg)
}

function checkSchemaNode(path, node) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    fail(`parameters${path} 不是对象`)
    return
  }
  if ('type' in node && !JSON_TYPES.has(node.type)) {
    fail(`parameters${path}.type = ${JSON.stringify(node.type)} 不是标准 JSON Schema 类型（作者 DSL 的 type:'json' 只能给 defineTool 用）`)
  }
  if ('required' in node) {
    if (node.required === true) {
      fail(`parameters${path} 含 DSL 残留 required:true 内联（标准 JSON Schema 里 required 是数组，只能出现在对象根）`)
    } else if (!Array.isArray(node.required) || node.required.some((v) => typeof v !== 'string')) {
      fail(`parameters${path}.required 必须是字符串数组`)
    }
  }
  if ('enum' in node && !Array.isArray(node.enum)) {
    fail(`parameters${path}.enum 必须是数组`)
  }
  if (typeof node.properties === 'object' && node.properties !== null) {
    for (const [pname, child] of Object.entries(node.properties)) {
      checkSchemaNode(`${path}.properties.${pname}`, child)
    }
  }
  if (typeof node.items === 'object' && node.items !== null) {
    checkSchemaNode(`${path}.items`, node.items)
  }
}

function main() {
  // 1) 启动闸门：output.schema 的真实校验
  try {
    assertSupportedJsonSchema(diagramTool.output.schema)
    console.log('PASS output.schema 通过 dsh-tools assertSupportedJsonSchema（启动闸门）')
  } catch (error) {
    fail('output.schema 被启动闸门拒绝：' + (error && error.message ? error.message : error))
  }

  // 2) parameters 结构检查（wire schema 会被模型 API 元校验）
  const p = diagramTool.parameters
  if (p === null || typeof p !== 'object' || Array.isArray(p)) {
    fail('parameters 必须是对象根')
  } else {
    if (p.type !== 'object') fail('parameters 根必须 type:"object"（标准 JSON Schema）')
    if (typeof p.properties !== 'object' || p.properties === null) fail('parameters 缺 properties 对象')
    if (!Array.isArray(p.required)) fail('parameters 缺 required 字符串数组')
    else if (p.required.some((v) => typeof v !== 'string')) fail('parameters.required 含非字符串')
    for (const [pname, child] of Object.entries(p.properties ?? {})) {
      checkSchemaNode(`.properties.${pname}`, child)
    }
  }

  // 3) 端到端执行
  diagramTool.execute({
    type: 'seq',
    title: 'validate-自检',
    mermaid: 'sequenceDiagram\n  participant A as 甲\n  participant B as 乙\n  A->>B: 你好\n  B-->>A: 收到',
  }).then((r) => {
    if (r.ok !== true) fail('端到端执行失败：' + r.error)
    else {
      console.log('PASS 端到端执行 ok，报告 ' + JSON.stringify({ c: r.report.crossings, o: r.report.overlaps, t: r.report.textOverflow }))
      if (r.report.crossings !== 0 || r.report.overlaps !== 0 || r.report.textOverflow !== 0) fail('质检非全 0')
      if (typeof r.svg !== 'string' || !r.svg.includes('<svg')) fail('SVG 缺失')
      if (typeof r.svgPath !== 'string' || !r.svgPath.endsWith('.svg')) fail('svgPath 异常：' + r.svgPath)
    }
    if (failures > 0) {
      console.error(`\n${failures} 项失败 —— 禁止重启 dsh，先修复 plugin/host.js`)
      process.exit(1)
    }
    console.log('\n全部通过 —— 可以安全重启 dsh web')
  })
}

main()
