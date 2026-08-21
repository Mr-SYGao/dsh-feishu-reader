// 从 lib/（单一来源）生成动态版 host.js / client.js（cordis_define 粘贴用）
// 用法：node scripts/build-dynamic.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptSource = readFileSync(path.join(root, 'lib', 'script.js'), 'utf8')

const hostJs = `// 生成文件：由 scripts/build-dynamic.mjs 生成，勿手改。
// 动态版 Host 半部（cordis_define 的 code.host 用）。引擎逻辑单一来源：lib/script.js。
// 安全：凭证经 stdin 传给引擎子进程，不落命令行。
module.exports = function feishuReaderHost() {
  return {
    apply(ctx) {
      const subprocess = ctx.get('subprocess')
      const credentials = ctx.get('credentials')
      const sandboxPolicy = ctx.get('sandboxPolicy')
      const settings = ctx.get('settings')

      const script = ${JSON.stringify(scriptSource)}

      if (settings) {
        // 设置命名空间 feishu：让「插件配置」卡片可被 dispatch；appId 作为非敏感配置。
        function feishuSettingsSchema(input) {
          return { appId: (input && input.appId) ? String(input.appId) : '' }
        }
        feishuSettingsSchema.type = 'object'
        feishuSettingsSchema.dict = {}
        feishuSettingsSchema.meta = {}
        feishuSettingsSchema.toJSON = function () { return { type: 'object', properties: {} } }
        try { settings.register('feishu', feishuSettingsSchema) } catch (e) {}
      }

      async function resolveCreds(args) {
        let appId = (args && typeof args.app_id === 'string' && args.app_id) ? args.app_id : undefined
        let appSecret = (args && typeof args.app_secret === 'string' && args.app_secret) ? args.app_secret : undefined
        let section
        try { section = settings ? settings.get('feishu') : undefined } catch (e) {}
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
        if (!subprocess) throw new Error('当前环境缺少 subprocess 服务，无法执行 HTTP 调用。')
        const cwd = sandboxPolicy && typeof sandboxPolicy.workspaceRoot === 'string' && sandboxPolicy.workspaceRoot ? sandboxPolicy.workspaceRoot : '.'
        let nodePath = 'node'
        try { nodePath = await subprocess.resolveExecutable('node') } catch (e) {}
        let handle
        try {
          handle = subprocess.spawn({
            argv: [nodePath, '--input-type=module', '-e', script, '--', 'run'],
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

      const readTool = harness.defineTool({
        name: 'feishu_read',
        description: '读取飞书文档链接并返回 Markdown，同时把文档内图片下载到本地临时缓存（24 小时自动清理，按 token 缓存；文档内容 10 分钟缓存）。支持：docx、wiki、sheets、bitable。',
        parameters: {
          url: { type: 'string', required: true, description: '飞书文档链接，例如 https://xxx.feishu.cn/docx/AbCdEf...，也支持 /wiki/、/sheets/、/base/ 链接' },
          app_id: { type: 'string', description: '可选，覆盖默认的飞书 App ID' },
          app_secret: { type: 'string', description: '可选，覆盖默认的飞书 App Secret' }
        },
        output: {
          schema: {
            type: 'object', additionalProperties: false,
            properties: {
              markdown: { type: 'string', required: true },
              images: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { n: { type: 'number' }, path: { type: 'string' } } } }
            }
          },
          render: (args, value) => {
            let text = value.markdown || ''
            if (value.images && value.images.length) {
              text += '\\n\\n---\\n已下载图片文件（可用 modlens_read_image / read_image 读取）：\\n' + value.images.map((img) => img.path).join('\\n')
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
      })

      const configureTool = harness.defineTool({
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
          const appId = String(args.app_id).trim()
          const appSecret = String(args.app_secret).trim()
          if (!appId || !appSecret) throw new Error('App ID 和 App Secret 不能为空。')
          if (!credentials) throw new Error('当前环境没有 credentials 服务，无法保存 App Secret。')
          if (settings) await settings.update('feishu', { appId })
          await credentials.set('FEISHU_APP_SECRET', appSecret)
          return { saved: ['feishu.appId', 'FEISHU_APP_SECRET'] }
        }
      })

      ctx.effect(() => harness.registerTool(ctx, readTool))
      ctx.effect(() => harness.registerTool(ctx, configureTool))

      ctx.effect(() => harness.handle('feishu-save', async (args) => {
        const appId = (args && typeof args.appId === 'string') ? args.appId.trim() : ''
        const appSecret = (args && typeof args.appSecret === 'string') ? args.appSecret.trim() : ''
        if (!appId || !appSecret) return { ok: false, error: 'App ID 和 App Secret 不能为空。' }
        if (!credentials) return { ok: false, error: '当前环境没有 credentials 服务。' }
        try {
          if (settings) await settings.update('feishu', { appId })
          await credentials.set('FEISHU_APP_SECRET', appSecret)
          return { ok: true }
        } catch (e) {
          return { ok: false, error: '保存失败：' + (e && e.message ? e.message : String(e)) }
        }
      }))

      ctx.effect(() => harness.handle('feishu-status', async () => {
        let appId = ''
        let secretSet = false
        let section
        try { section = settings ? settings.get('feishu') : undefined } catch (e) {}
        if (section && section.appId) appId = section.appId
        if (credentials) {
          try {
            const info = await credentials.describe('FEISHU_APP_SECRET')
            secretSet = !!(info && info.configured)
          } catch (e) {}
        }
        return { configured: !!(appId && secretSet), appId, secretSet }
      }))
    },
  }
}
`

const clientJs = `// 生成文件：由 scripts/build-dynamic.mjs 生成，勿手改。
// 动态版 Client 半部（cordis_define 的 code.client 用）。
module.exports = function feishuReaderClient() {
  return {
    apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      styles.insert(\`\\n.feishu-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}\\n.feishu-card:hover{border-color:var(--dsw-alias-label-dimmed)}\\n.feishu-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}\\n.feishu-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}\\n.feishu-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}\\n.feishu-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}\\n.feishu-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}\\n.feishu-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}\\n.feishu-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}\\n.feishu-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}\\n.feishu-chevron-open{transform:rotate(180deg)}\\n.feishu-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:16px 0 8px}\\n.feishu-field{display:flex;flex-direction:column;gap:4px;font-size:13px;margin-bottom:12px}\\n.feishu-label{font-weight:600;color:var(--dsw-alias-label-primary)}\\n.feishu-input{padding:8px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font-size:13px;width:100%;box-sizing:border-box}\\n.feishu-message{font-size:13px}\\n.feishu-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px}\\n.feishu-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-brand-primary, #3370ff);color:#fff}\\n.feishu-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.7;margin-top:12px}\\n\`)

      function Chevron(open) {
        return React.createElement('svg', {
          width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
          className: 'feishu-chevron' + (open ? ' feishu-chevron-open' : '')
        }, React.createElement('path', {
          d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'
        }))
      }

      function FeishuCard() {
        const [open, setOpen] = React.useState(false)
        const [appId, setAppId] = React.useState('')
        const [appSecret, setAppSecret] = React.useState('')
        const [status, setStatus] = React.useState('loading')
        const [message, setMessage] = React.useState(null)

        React.useEffect(() => {
          let alive = true
          host.call('feishu-status').then((r) => {
            if (!alive) return
            setStatus((r && r.configured) ? 'configured' : 'unconfigured')
            if (r && r.appId) setAppId(r.appId)
          }).catch(() => {
            if (!alive) return
            setStatus('unconfigured')
          })
          return () => { alive = false }
        }, [])

        const save = () => {
          if (!appId.trim() || !appSecret.trim()) {
            setMessage({ kind: 'error', text: 'App ID 和 App Secret 不能为空。' })
            return
          }
          setMessage({ kind: 'pending', text: '保存中…' })
          host.call('feishu-save', { appId: appId.trim(), appSecret: appSecret.trim() }).then((r) => {
            if (r && r.ok) {
              setStatus('configured')
              setMessage({ kind: 'ok', text: '已保存。现在可以直接让助手读取飞书文档。' })
              setAppSecret('')
            } else {
              setMessage({ kind: 'error', text: (r && r.error) || '保存失败。' })
            }
          }).catch((e) => {
            setMessage({ kind: 'error', text: '保存失败：' + (e && e.message ? e.message : String(e)) })
          })
        }

        const msgColor = message && message.kind === 'error' ? 'var(--dsw-alias-label-error)' : message && message.kind === 'ok' ? '#188038' : 'var(--dsw-alias-label-tertiary)'

        return React.createElement('li', { className: 'feishu-card' + (open ? ' feishu-card-open' : '') },
          React.createElement('button', { type: 'button', className: 'feishu-header', 'aria-expanded': open, onClick: () => setOpen(!open) },
            React.createElement('span', { className: 'feishu-headText' },
              React.createElement('span', { className: 'feishu-name' }, '飞书'),
              React.createElement('span', { className: 'feishu-description' }, '读取飞书云文档、知识库、电子表格、多维表格')
            ),
            status === 'configured' ? React.createElement('span', { className: 'feishu-badge' }, '已配置') : null,
            Chevron(open)
          ),
          open ? React.createElement('div', { className: 'feishu-body' },
            React.createElement('label', { className: 'feishu-field' },
              React.createElement('span', { className: 'feishu-label' }, 'App ID'),
              React.createElement('input', { type: 'text', value: appId, placeholder: 'cli_xxxxxxxxxxxxxxxx', onChange: (e) => setAppId(e.target.value), className: 'feishu-input' })
            ),
            React.createElement('label', { className: 'feishu-field' },
              React.createElement('span', { className: 'feishu-label' }, 'App Secret'),
              React.createElement('input', { type: 'password', value: appSecret, placeholder: '••••••••••••••••', onChange: (e) => setAppSecret(e.target.value), className: 'feishu-input' })
            ),
            message ? React.createElement('div', { className: 'feishu-message', style: { color: msgColor } }, message.text) : null,
            React.createElement('div', { className: 'feishu-footer' },
              React.createElement('button', { type: 'button', className: 'feishu-save', onClick: save }, '保存凭证')
            ),
            React.createElement('div', { className: 'feishu-note' },
              React.createElement('div', null, '使用前需要在飞书开放平台为应用开通并发布以下权限：'),
              React.createElement('div', null, '· docx:document:readonly（云文档）'),
              React.createElement('div', null, '· wiki:wiki:readonly（知识库）'),
              React.createElement('div', null, '· sheets:spreadsheet:readonly（电子表格）'),
              React.createElement('div', null, '· bitable:app:readonly（多维表格）'),
              React.createElement('div', null, '· drive:drive:readonly（下载文档图片）'),
              React.createElement('div', { style: { marginTop: 6 } }, '并把该应用加为对应文档的协作者（知识库需加入成员）。')
            )
          ) : null
        )
      }

      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', key: 'feishu' },
        () => React.createElement(FeishuCard)
      ))
    },
  }
}
`

writeFileSync(path.join(root, 'host.js'), hostJs)
writeFileSync(path.join(root, 'client.js'), clientJs)
console.log('generated host.js + client.js from lib/')
