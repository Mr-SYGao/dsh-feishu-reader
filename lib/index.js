// 飞书文档读取插件 — Host 半部（真实 Cordis 插件包）
//
// - 凭证统一：App ID 存设置命名空间 feishu（非敏感配置），App Secret 存凭证库
//   （FEISHU_APP_SECRET，DSH 的密钥惯例）；读取时兼容回退旧凭证 FEISHU_APP_ID。
// - 安全：凭证通过 stdin 传给引擎子进程（不落命令行参数）。
// - 引擎单一来源：lib/script.js。
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { fileURLToPath } from 'node:url'

export const name = 'feishu-reader'
export const inject = ['tools', 'settings']
export const Config = z.object({})

export function apply(ctx, config) {
  // 注意：credentials / subprocess / sandboxPolicy 必须在「工具执行时」用
  // ctx.get 获取，不能在 apply 时缓存 —— apply 发生在启动阶段，这些服务的
  // fiber 可能尚未 active（Cordis ctx.get 默认 strict，未 active 的实现返回
  // undefined）。内置 apiproxy 等插件也是在请求处理时才访问。

  // 设置命名空间 feishu：让「插件配置」卡片可被 dispatch；appId 作为非敏感配置。
  const feishuSchema = z.object({
    appId: z.string().default('')
  })
  try {
    ctx.settings.register('feishu', feishuSchema, {})
  } catch (e) {
    // namespace may already be registered; that is fine.
  }

  async function resolveCreds(args) {
    const credentials = ctx.get('credentials')
    let appId = (args && typeof args.app_id === 'string' && args.app_id) ? args.app_id : undefined
    let appSecret = (args && typeof args.app_secret === 'string' && args.app_secret) ? args.app_secret : undefined
    let section
    try { section = ctx.settings.get('feishu') } catch (e) {}
    if (!appId && section && section.appId) appId = section.appId
    if (!appId && credentials) {
      const r = await credentials.resolve('FEISHU_APP_ID')
      if (r && r.value) appId = r.value
    }
    if (!appSecret && credentials) {
      const r = await credentials.resolve('FEISHU_APP_SECRET')
      if (r && r.value) appSecret = r.value
    }
    if (!appId || !appSecret) {
      throw new Error('缺少飞书凭证。请在「设置 → 插件 → 插件配置 → 飞书」中配置，或调用 feishu_configure。')
    }
    return { appId, appSecret }
  }

  async function runNode(payload, signal) {
    const subprocess = ctx.get('subprocess')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    if (!subprocess) throw new Error('当前环境缺少 subprocess 服务，无法执行 HTTP 调用。')
    const cwd = sandboxPolicy && typeof sandboxPolicy.workspaceRoot === 'string' && sandboxPolicy.workspaceRoot ? sandboxPolicy.workspaceRoot : '.'
    let nodePath = 'node'
    try { nodePath = await subprocess.resolveExecutable('node') } catch (e) {}
    const scriptPath = fileURLToPath(new URL('./script.js', import.meta.url))
    let handle
    try {
      handle = subprocess.spawn({
        argv: [nodePath, scriptPath],
        cwd,
        stdio: {
          stdin: { data: JSON.stringify(payload) },
          stdout: { maxBytes: 40000000 },
          stderr: { maxBytes: 200000 }
        },
        graceMs: 5000,
        ...(signal ? { signal } : {})
      })
    } catch (e) {
      throw new Error('无法启动 node 进程：' + (e && e.message ? e.message : String(e)))
    }
    try { await handle.done } catch (e) {}
    const stdout = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
    const stderr = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
    let parsed = null
    try { parsed = JSON.parse(stdout.trim()) } catch (e) {}
    if (parsed && parsed.ok === true) return parsed
    if (parsed && parsed.ok === false) throw new Error(parsed.error)
    throw new Error('读取飞书文档失败：' + (stderr.trim() || stdout.trim() || '无输出'))
  }

  ctx.tools.register(defineTool({
    name: 'feishu_read',
    description: '读取飞书文档链接并返回 Markdown，同时把文档内图片下载到本地临时缓存（系统临时目录，24 小时自动清理，按文件 token 缓存避免重复下载；文档内容 10 分钟缓存）。支持：云文档 docx、知识库 wiki、电子表格 sheets、多维表格 bitable。',
    parameters: {
      url: { type: 'string', required: true, description: '飞书文档链接，例如 https://xxx.feishu.cn/docx/AbCdEf...，也支持 /wiki/、/sheets/、/base/ 链接' },
      app_id: { type: 'string', description: '可选，覆盖默认的飞书 App ID' },
      app_secret: { type: 'string', description: '可选，覆盖默认的飞书 App Secret' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          markdown: { type: 'string', required: true },
          images: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { n: { type: 'number' }, path: { type: 'string' } } } }
        }
      },
      render: (args, value) => {
        let text = value.markdown || ''
        if (value.images && value.images.length) {
          text += '\n\n---\n已下载图片文件（可用 modlens_read_image / read_image 读取）：\n' + value.images.map((img) => img.path).join('\n')
        }
        return [{ type: 'text', text: text }]
      }
    },
    timeoutMs: 180000,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const creds = await resolveCreds(args)
      const result = await runNode({ url: args.url, appId: creds.appId, appSecret: creds.appSecret }, exec.signal)
      return { markdown: result.markdown, images: result.images || [] }
    }
  }))

  ctx.tools.register(defineTool({
    name: 'feishu_configure',
    description: '保存飞书自建应用的凭证：App ID 存到设置（feishu.appId），App Secret 存到凭证库（FEISHU_APP_SECRET）。',
    parameters: {
      app_id: { type: 'string', required: true, description: '飞书开放平台自建应用的 App ID（通常以 cli_ 开头）' },
      app_secret: { type: 'string', required: true, description: '飞书开放平台自建应用的 App Secret' }
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { saved: { type: 'array', items: { type: 'string' } } } },
      render: (args, value) => [{ type: 'text', text: '已保存飞书凭证：' + value.saved.join(', ') + '。现在可以直接用 feishu_read 读取文档。' }]
    },
    async execute(args) {
      const credentials = ctx.get('credentials')
      const appId = String(args.app_id).trim()
      const appSecret = String(args.app_secret).trim()
      if (!appId || !appSecret) throw new Error('App ID 和 App Secret 不能为空。')
      if (!credentials) throw new Error('当前环境没有 credentials 服务，无法保存 App Secret。')
      await ctx.settings.update('feishu', { appId })
      await credentials.set('FEISHU_APP_SECRET', appSecret)
      return { saved: ['feishu.appId', 'FEISHU_APP_SECRET'] }
    }
  }))
}
