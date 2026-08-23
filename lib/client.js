// 飞书文档读取插件 — Client 半部（真实 Cordis 插件包的浏览器 bundle）
//
// 格式：DSH 静态 client bundle 协议（dsh-client-modules）。
// - 脚本顶层必须调用 window.__ModuleLoader__.load({ id, factory }) 注册自己；
//   注册 id = 包名（= loader entry name = 'dsh-feishu-reader'）。
// - factory 是 CJS 形态，依赖用 require() 解析：'react' 是平台 seed word，
//   无需声明 external。
// - 插件面：exports.inject（服务名数组）+ exports.apply（client cordis apply）。
//
// 「设置 → 插件 → 插件配置 → 飞书」折叠卡片。
// - App ID：settings 域（feishu 命名空间，非敏感配置，可回显）
// - App Secret：credentials 域（FEISHU_APP_SECRET，只显示是否已配置，不回显）
window.__ModuleLoader__.load({
  id: 'dsh-feishu-reader',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    const SECRET_REF = 'FEISHU_APP_SECRET'
    const NS = 'feishu'

    const css = `
.feishu-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.feishu-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.feishu-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.feishu-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.feishu-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.feishu-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.feishu-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.feishu-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.feishu-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.feishu-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.feishu-chevron-open{transform:rotate(180deg)}
.feishu-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:16px 0 8px}
.feishu-field{display:flex;flex-direction:column;gap:4px;font-size:13px;margin-bottom:12px}
.feishu-label{font-weight:600;color:var(--dsw-alias-label-primary)}
.feishu-input{padding:8px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font-size:13px;width:100%;box-sizing:border-box}
.feishu-message{font-size:13px}
.feishu-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px}
.feishu-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-brand-primary, #3370ff);color:#fff}
.feishu-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.7;margin-top:12px}
`

    // CSS 在 factory 内注入：materialization（首次 import）时执行，随后被
    // client-modules 的 claimStyles 认领（data-plugin 标注 / HMR 清理）。
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="dsh-feishu-reader"]')) {
      const tag = document.createElement('style')
      tag.dataset.pluginCss = 'dsh-feishu-reader'
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function Chevron(open) {
      return React.createElement('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
        className: 'feishu-chevron' + (open ? ' feishu-chevron-open' : '')
      }, React.createElement('path', {
        d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'
      }))
    }

    function FeishuCard({ api }) {
      const [open, setOpen] = React.useState(false)
      const [appId, setAppId] = React.useState('')
      const [secret, setSecret] = React.useState('')
      const [secretSet, setSecretSet] = React.useState(false)
      const [message, setMessage] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        Promise.all([
          api.settings.describe({}),
          api.credentials.describe({ refs: [SECRET_REF] })
        ]).then(([settingsRes, credRes]) => {
          if (!alive) return
          if (settingsRes && settingsRes.result && settingsRes.result.ok) {
            const ns = (settingsRes.result.value.namespaces || []).find((n) => n.ns === NS)
            if (ns) setAppId((ns.value && ns.value.appId) || '')
          }
          if (credRes && credRes.result && credRes.result.ok && credRes.result.value) {
            const view = credRes.result.value.credentials && credRes.result.value.credentials[SECRET_REF]
            setSecretSet(!!(view && view.configured))
          }
        }).catch(() => {})
        return () => { alive = false }
      }, [api])

      const save = () => {
        if (!appId.trim()) {
          setMessage({ kind: 'error', text: 'App ID 不能为空。' })
          return
        }
        setMessage({ kind: 'pending', text: '保存中…' })
        const ops = []
        if (secret.trim()) {
          ops.push(api.credentials.set({ ref: SECRET_REF, value: secret.trim() }))
        }
        Promise.all([
          api.settings.update({ ns: NS, patch: { appId: appId.trim() } }),
          ...ops
        ]).then(([settingsRes, credSetRes]) => {
          const settingsOk = settingsRes && settingsRes.result && settingsRes.result.ok
          const credOk = !secret.trim() || (credSetRes && credSetRes.result && credSetRes.result.ok)
          if (settingsOk && credOk) {
            setMessage({ kind: 'ok', text: '已保存。现在可以直接让助手读取飞书文档。' })
            setSecret('')
            setSecretSet(true)
          } else {
            const err = settingsRes && settingsRes.result && settingsRes.result.error
            setMessage({ kind: 'error', text: (err && err.message) || '保存失败。' })
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
          secretSet ? React.createElement('span', { className: 'feishu-badge' }, '已配置') : null,
          Chevron(open)
        ),
        open ? React.createElement('div', { className: 'feishu-body' },
          React.createElement('label', { className: 'feishu-field' },
            React.createElement('span', { className: 'feishu-label' }, 'App ID'),
            React.createElement('input', { type: 'text', value: appId, placeholder: 'cli_xxxxxxxxxxxxxxxx', onChange: (e) => setAppId(e.target.value), className: 'feishu-input' })
          ),
          React.createElement('label', { className: 'feishu-field' },
            React.createElement('span', { className: 'feishu-label' }, 'App Secret'),
            React.createElement('input', { type: 'password', value: secret, placeholder: secretSet ? '已配置（留空保持不变）' : '••••••••••••••••', onChange: (e) => setSecret(e.target.value), className: 'feishu-input' })
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

    function apply(ctx) {
      const slots = ctx.get('slots')
      const connection = ctx.get('connection')
      if (!slots || !connection) return
      const { api } = connection
      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', key: NS },
        () => React.createElement(FeishuCard, { api })
      ))
    }

    /** Required services (cordis fiber inject). */
    const inject = ['slots', 'connection']
    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
