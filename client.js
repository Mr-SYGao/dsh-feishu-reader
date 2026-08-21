'use strict'

/**
 * 飞书文档读取插件 — Client 半部（DSH 动态 Cordis 插件）
 *
 * 在「设置 → 插件 → 插件配置」里注册一张「飞书」卡片：
 * - 折叠式卡片（标题 + 描述 + 已配置徽标 + 箭头，点击展开）
 * - 配置飞书自建应用的 App ID / App Secret
 * - 保存凭证走 Host RPC（feishu-save），状态查询走 feishu-status
 *
 * 加载方式：把本文件内容（module.exports 返回的插件对象）作为
 * cordis_define 的 code.client 使用；也可直接 require 本模块。
 */
module.exports = function feishuReaderClient() {
  return {
    apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      styles.insert(`\n.feishu-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}\n.feishu-card:hover{border-color:var(--dsw-alias-label-dimmed)}\n.feishu-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}\n.feishu-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}\n.feishu-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}\n.feishu-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}\n.feishu-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}\n.feishu-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}\n.feishu-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}\n.feishu-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}\n.feishu-chevron-open{transform:rotate(180deg)}\n.feishu-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:16px 0 8px}\n.feishu-field{display:flex;flex-direction:column;gap:4px;font-size:13px;margin-bottom:12px}\n.feishu-label{font-weight:600;color:var(--dsw-alias-label-primary)}\n.feishu-input{padding:8px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font-size:13px;width:100%;box-sizing:border-box}\n.feishu-message{font-size:13px}\n.feishu-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px}\n.feishu-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-brand-primary, #3370ff);color:#fff}\n.feishu-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.7;margin-top:12px}\n`)

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
