// 飞书文档读取插件 — Client 半部（真实 Cordis 插件包）
//
// 在「设置 → 插件 → 插件配置」注册「飞书」卡片（折叠式）。
// 卡片通过 connection 的 settings 域读写 feishu 命名空间（App ID / App Secret）。
import React from 'react'

export const name = 'feishu-reader'
export const inject = ['slots', 'connection']

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

function secretSetOf(view) {
  const sec = ((view && view.secrets) || []).find((s) => s.path && s.path[0] === 'appSecret')
  return !!(sec && sec.set)
}

function FeishuCard({ api }) {
  const [open, setOpen] = React.useState(false)
  const [appId, setAppId] = React.useState('')
  const [secret, setSecret] = React.useState('')
  const [secretSet, setSecretSet] = React.useState(false)
  const [message, setMessage] = React.useState(null)

  React.useEffect(() => {
    let alive = true
    api.settings.describe({}).then((res) => {
      if (!alive || !res || !res.result || !res.result.ok) return
      const ns = (res.result.value.namespaces || []).find((n) => n.ns === 'feishu')
      if (!ns) return
      setAppId((ns.value && ns.value.appId) || '')
      setSecretSet(secretSetOf(ns))
    }).catch(() => {})
    return () => { alive = false }
  }, [api])

  const save = () => {
    if (!appId.trim()) {
      setMessage({ kind: 'error', text: 'App ID 不能为空。' })
      return
    }
    const patch = { appId: appId.trim() }
    if (secret.trim()) patch.appSecret = secret.trim()
    setMessage({ kind: 'pending', text: '保存中…' })
    api.settings.update({ ns: 'feishu', patch }).then((res) => {
      const value = res && res.result && res.result.ok ? res.result.value : undefined
      if (value) {
        setMessage({ kind: 'ok', text: '已保存。现在可以直接让助手读取飞书文档。' })
        setSecret('')
        setSecretSet(secretSetOf(value))
      } else {
        const err = res && res.result && res.result.error
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

export function apply(ctx) {
  const slots = ctx.get('slots')
  const connection = ctx.get('connection')
  if (!slots || !connection) return
  const { api } = connection
  slots.inject('settings.plugin.item', () => slots.register(
    { name: 'settings.plugin.item', key: 'feishu' },
    () => React.createElement(FeishuCard, { api })
  ))
}
