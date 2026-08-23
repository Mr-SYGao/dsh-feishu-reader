// Host 侧运行时模拟验证：用假 ctx 跑 lib/index.js 的 apply，验证
//   1. apply 不抛错（settings.register + tools.register）
//   2. 工具注册了 feishu_read / feishu_configure
//   3. feishu_read.execute 在「运行时」通过 ctx.get 拿到 credentials /
//      subprocess（修复：不在 apply 时缓存服务，避免 fiber 未 active）
//   4. feishu_configure.execute 走 credentials.set + settings.update
// 用法：node scripts/verify-host.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { register } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 把 @deepseek-ai/* 解析到 DSH 共享依赖层（仅测试环境）
register(pathToFileURL(path.join(root, 'scripts', 'dsh-node-resolve-hook.mjs')).href, import.meta.url)
const mod = await import(pathToFileURL(path.join(root, 'lib', 'index.js')).href)

let failed = false
const check = (label, cond) => {
  console.log(`${cond ? '✔' : '✘'} ${label}`)
  if (!cond) failed = true
}

check('插件导出 name/inject/apply', mod.name === 'feishu-reader' && Array.isArray(mod.inject) && typeof mod.apply === 'function')

const registered = []
const calls = { settingsUpdate: 0, credSet: 0, credResolve: [] }
const fakeCredentials = {
  async resolve(ref) {
    calls.credResolve.push(ref)
    if (ref === 'FEISHU_APP_ID') return { value: 'cli_test_app_id', source: 'file' }
    if (ref === 'FEISHU_APP_SECRET') return { value: 'test_secret', source: 'file' }
    return undefined
  },
  async set() { calls.credSet++ },
  async describe() { return { configured: true, writable: true } }
}
const fakeSubprocess = {
  async resolveExecutable() { return 'node' },
  spawn() {
    return {
      done: Promise.resolve(),
      collected: { stdout: { readFrom: () => ({ text: JSON.stringify({ ok: true, markdown: '# 模拟文档', images: [] }) }) }, stderr: { readFrom: () => ({ text: '' }) } }
    }
  }
}
const fakeCtx = {
  settings: {
    register() {},
    get() { return { appId: '' } },
    async update() { calls.settingsUpdate++ }
  },
  tools: { register(def) { registered.push(def) } },
  get(name) {
    if (name === 'credentials') return fakeCredentials
    if (name === 'subprocess') return fakeSubprocess
    if (name === 'sandboxPolicy') return { workspaceRoot: process.cwd() }
    return undefined
  }
}

mod.apply(fakeCtx, {})

check('注册了 2 个工具', registered.length === 2)
check('工具名 feishu_read / feishu_configure', registered.map((t) => t.name).sort().join(',') === 'feishu_configure,feishu_read')

const read = registered.find((t) => t.name === 'feishu_read')
const configure = registered.find((t) => t.name === 'feishu_configure')

const readRes = await read.execute({ url: 'https://example.feishu.cn/docx/test' }, { signal: undefined })
check('feishu_read.execute 拿到凭据并走引擎', readRes.markdown === '# 模拟文档' && calls.credResolve.includes('FEISHU_APP_ID') && calls.credResolve.includes('FEISHU_APP_SECRET'))

await configure.execute({ app_id: 'cli_new', app_secret: 'new_secret' })
check('feishu_configure.execute 写 settings + credentials', calls.settingsUpdate === 1 && calls.credSet === 1)

process.exit(failed ? 1 : 0)
