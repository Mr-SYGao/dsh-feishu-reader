// Client bundle 协议验证：在 node 里模拟 dsh-client-modules 的浏览器加载。
// 检查 lib/client.js（静态 bundle）：
//   1. 顶层调用 window.__ModuleLoader__.load，注册 id === 'dsh-feishu-reader'
//   2. factory(require) 可执行，exports 带 inject（['slots','connection']）和 apply
//   3. 'react' 通过 require 解析（seed word）
// 用法：node scripts/verify-client.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')

let registration = null
const loader = {
  load(reg) {
    registration = reg
  }
}
const styles = []
const documentStub = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, set textContent(v) { styles.push(v) } }),
  head: { appendChild: () => {} }
}
const reactStub = { createElement: () => null, useState: () => [], useEffect: () => {} }

const sandbox = {
  window: { __ModuleLoader__: loader },
  document: documentStub,
  require: (spec) => {
    if (spec === 'react') return reactStub
    throw new Error(`unexpected require("${spec}")`)
  }
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

let failed = false
const check = (label, cond) => {
  console.log(`${cond ? '✔' : '✘'} ${label}`)
  if (!cond) failed = true
}

check('顶层调用 __ModuleLoader__.load', registration !== null)
check(`注册 id = "dsh-feishu-reader"（实际: ${registration ? JSON.stringify(registration.id) : '无'}）`, registration !== null && registration.id === 'dsh-feishu-reader')

if (registration) {
  const exports = registration.factory((spec) => sandbox.require(spec))
  check('factory 可执行且导出 inject/apply', exports && Array.isArray(exports.inject) && typeof exports.apply === 'function')
  check(`inject = ['slots','connection']（实际: ${JSON.stringify(exports && exports.inject)}）`, JSON.stringify(exports && exports.inject) === JSON.stringify(['slots', 'connection']))
  check('CSS 已注入（materialization 时）', styles.length === 1 && styles[0].includes('.feishu-card'))
  const ctx = { get: () => undefined }
  exports.apply(ctx) // 无 slots/connection 时应安全返回
  check('apply 在缺少服务时安全返回', true)
}

process.exit(failed ? 1 : 0)
