// 飞书文档读取引擎 —— 纯函数 + CLI runner（单一来源）
//
// 安全：凭证通过 **stdin** 传入（不落命令行参数）。
// 亮点：Markdown 表格（合并格内容重复不丢失）、单元格图片路径引用、
//       行内格式（粗体/行内代码/链接）、文档内容缓存（10 分钟 TTL）、
//       内嵌多维表格、文件块占位。
//
// 既可被 lib/index.js spawn 执行（node script.js < input.json），
// 也可 import 纯函数供单元测试使用。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const BASE = 'https://open.feishu.cn/open-apis'
const NL = String.fromCharCode(10)
const TTL_MS = 24 * 60 * 60 * 1000            // 图片缓存 TTL
const CACHE_TTL_MS = 10 * 60 * 1000           // 文档内容缓存 TTL
const CAP_ROWS = 500
const CAP_COLS = 60
const CAP_RECORDS = 500
const CAP_CHARS = 400000
const CAP_IMAGES = 30

const outDir = path.join(os.tmpdir(), 'dsh-feishu-images')
const cacheDir = path.join(os.tmpdir(), 'dsh-feishu-cache')
try { fs.mkdirSync(outDir, { recursive: true }) } catch (e) {}
try { fs.mkdirSync(cacheDir, { recursive: true }) } catch (e) {}

// ── 纯函数（可测试） ────────────────────────────────────────────────

export function parseLink(url) {
  const u = String(url).trim()
  const markers = [
    ['/wiki/', 'wiki'], ['/sheets/', 'sheets'], ['/base/', 'bitable'],
    ['/bitable/', 'bitable'], ['/docx/', 'docx'], ['/docs/', 'docx'],
    ['/mindnotes/', 'other'], ['/slides/', 'other'], ['/minutes/', 'other'], ['/file/', 'other']
  ]
  let seg = null
  let type = null
  for (const [marker, t] of markers) {
    if (u.indexOf(marker) >= 0) { seg = marker; type = t; break }
  }
  if (seg !== null) {
    let rest = u.slice(u.indexOf(seg) + seg.length)
    let cut = rest.length
    const q = rest.indexOf('?'); if (q >= 0 && q < cut) cut = q
    const h = rest.indexOf('#'); if (h >= 0 && h < cut) cut = h
    rest = rest.slice(0, cut)
    while (rest.charAt(0) === '/') rest = rest.slice(1)
    while (rest.charAt(rest.length - 1) === '/') rest = rest.slice(0, rest.length - 1)
    if (rest) return { type, token: rest }
  }
  let bare = u.length >= 8
  for (let j = 0; j < u.length; j++) {
    const c = u.charAt(j)
    const ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-'
    if (!ok) { bare = false; break }
  }
  if (bare) return { type: 'docx', token: u }
  throw new Error('无法识别的飞书链接：' + u)
}

export function scalar(v) {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map(scalar).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function esc(s) {
  let str = String(s)
  let out = ''
  for (let i = 0; i < str.length; i++) {
    const c = str.charAt(i)
    if (c === '|') out += '&#124;'
    else if (c === String.fromCharCode(10)) out += '<br>'
    else if (c === String.fromCharCode(13)) { /* drop CR */ }
    else out += c
  }
  return out
}

export function toTable(headers, rows) {
  const h = headers.map(String)
  const lines = []
  lines.push('| ' + h.map(esc).join(' | ') + ' |')
  lines.push('| ' + h.map(() => '---').join(' | ') + ' |')
  for (const row of rows) {
    const cells = []
    for (let j = 0; j < h.length; j++) cells.push(esc(scalar(row[j])))
    lines.push('| ' + cells.join(' | ') + ' |')
  }
  return lines.join(NL)
}

export function styledText(content, style) {
  let inner = content || ''
  if (style) {
    if (style.inline_code) inner = '`' + inner + '`'
    if (style.bold) inner = '**' + inner + '**'
    if (style.italic) inner = '*' + inner + '*'
    if (style.strike) inner = '~~' + inner + '~~'
  }
  if (style && style.link && style.link.url) return '[' + inner + '](' + style.link.url + ')'
  return inner
}

export function textContent(t) {
  if (!t || !t.elements) return ''
  let out = ''
  for (const el of t.elements) {
    if (el.text_run) out += styledText(el.text_run.content, el.text_run.text_element_style)
    else if (el.mention_doc) out += el.mention_doc.title || ''
    else if (el.mention_user) out += '[用户]'
    else if (el.equation) out += el.equation.content || ''
    else if (el.reminder) out += '[提醒]'
    else if (el.inline_file) out += '[文件]'
  }
  return out
}

export function blockText(b) {
  const fields = [
    'text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5',
    'heading6', 'heading7', 'heading8', 'heading9', 'bullet', 'ordered',
    'todo', 'quote', 'code', 'callout'
  ]
  for (const f of fields) {
    const v = b[f]
    if (v && v.elements) return textContent(v)
  }
  return ''
}

export function cellText(blockMap, cellId) {
  const cell = blockMap[cellId]
  if (!cell) return ''
  const parts = []
  for (const cid of (cell.children || [])) {
    const ch = blockMap[cid]
    if (!ch) continue
    if (ch.image && ch.image.token) { parts.push('[[CELLIMG:' + ch.image.token + ']]'); continue }
    if (ch.bitable && ch.bitable.token) { parts.push('[内嵌表格]'); continue }
    const txt = blockText(ch)
    if (txt) parts.push(txt)
  }
  return parts.join('<br>')
}

export function renderTable(blockMap, tb) {
  const t = tb.table || {}
  const cells = t.cells || []
  const prop = t.property || {}
  const rows = prop.row_size || 0
  const cols = prop.column_size || 0
  if (!cells.length || !rows || !cols) return ''
  const mergeInfo = prop.merge_info || []
  const grid = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      row.push(cells[idx] ? cellText(blockMap, cells[idx]) : '')
    }
    grid.push(row)
  }
  // 合并单元格：把主单元格内容复制到覆盖位置（Markdown 无法表达合并，但不丢信息）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mi = mergeInfo[r * cols + c]
      if (!mi) continue
      const cs = mi.col_span || 1
      const rs = mi.row_span || 1
      if (cs > 1 || rs > 1) {
        const text = grid[r][c]
        for (let rr = r; rr < Math.min(rows, r + rs); rr++) {
          for (let cc = c; cc < Math.min(cols, c + cs); cc++) {
            if (rr === r && cc === c) continue
            grid[rr][cc] = text
          }
        }
      }
    }
  }
  const headerRow = prop.header_row ? grid[0] : null
  const body = headerRow ? grid.slice(1) : grid
  if (headerRow) return toTable(headerRow.map(String), body)
  const headers = []
  for (let j = 0; j < cols; j++) headers.push('列' + (j + 1))
  return toTable(headers, grid)
}

export function valuesToTable(values) {
  if (!values || !values.length) return '(空表格)'
  const rows = values.slice(0, CAP_ROWS).map((r) => (r || []).slice(0, CAP_COLS))
  const headers = rows[0].map((c, i) => (c === null || c === undefined) ? ('列' + (i + 1)) : String(c))
  return toTable(headers, rows.slice(1).map((r) => r.map(scalar)))
}

// ── 内部工具 ─────────────────────────────────────────────────────────

function fail(msg) {
  console.log(JSON.stringify({ ok: false, error: String(msg) }))
  process.exit(0)
}

function cleanupDir(dir, ttlMs) {
  let files = []
  try { files = fs.readdirSync(dir) } catch (e) { return }
  const now = Date.now()
  for (const f of files) {
    const fp = path.join(dir, f)
    try {
      const st = fs.statSync(fp)
      if (now - st.mtimeMs > ttlMs) fs.unlinkSync(fp)
    } catch (e) { /* ignore */ }
  }
}

function findCached(token) {
  const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
  for (const ext of exts) {
    const p = path.join(outDir, token + ext)
    try { if (fs.existsSync(p)) return p } catch (e) { /* ignore */ }
  }
  return null
}

function cacheGet(key) {
  const fp = path.join(cacheDir, key + '.json')
  try {
    const st = fs.statSync(fp)
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) { fs.unlinkSync(fp); return null }
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch (e) { return null }
}

function cacheSet(key, value) {
  try { fs.writeFileSync(path.join(cacheDir, key + '.json'), JSON.stringify(value)) } catch (e) { /* ignore */ }
}

async function feishu(token, pathName, init) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {}
  const res = await fetch(BASE + pathName, Object.assign({ headers, signal: AbortSignal.timeout(30000) }, init || {}))
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (e) { /* not json */ }
  if (json && typeof json.code === 'number' && json.code !== 0) {
    throw new Error('飞书接口错误 ' + pathName + '：' + (json.msg || ('code ' + json.code)))
  }
  if (!res.ok && !json) throw new Error('HTTP ' + res.status + ' ' + pathName)
  return json ? json.data : null
}

async function getToken(appId, appSecret) {
  const res = await fetch(BASE + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(30000)
  })
  const json = await res.json()
  if (!json || json.code !== 0) {
    throw new Error('获取 tenant_access_token 失败：' + ((json && json.msg) || ('HTTP ' + res.status)) + (json && json.code ? (' (code ' + json.code + ')') : ''))
  }
  return json.tenant_access_token
}

async function readBlocks(token, docId) {
  const all = []
  let pageToken = null
  while (true) {
    let p = '/docx/v1/documents/' + encodeURIComponent(docId) + '/blocks?page_size=500'
    if (pageToken) p += '&page_token=' + encodeURIComponent(pageToken)
    const d = await feishu(token, p)
    const items = (d && d.items) || []
    for (const it of items) all.push(it)
    if (!d || !d.has_more || !d.page_token) break
    pageToken = d.page_token
  }
  return all
}

async function downloadImage(token, fileToken) {
  const res = await fetch(BASE + '/drive/v1/medias/' + encodeURIComponent(fileToken) + '/download', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(60000)
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || ''
  let ext = '.png'
  if (ct.indexOf('jpeg') >= 0 || ct.indexOf('jpg') >= 0) ext = '.jpg'
  else if (ct.indexOf('gif') >= 0) ext = '.gif'
  else if (ct.indexOf('webp') >= 0) ext = '.webp'
  return { buf, ext }
}

// ── 渲染 ─────────────────────────────────────────────────────────────

function headingMark(n) { let s = ''; for (let i = 0; i < n; i++) s += '#'; return s }

function renderBlock(b) {
  const t = b.block_type
  if (t >= 3 && t <= 11) { const h = blockText(b); return h ? (headingMark(t - 2) + ' ' + h) : '' }
  if (t === 2) return blockText(b)
  if (t === 12) return '- ' + blockText(b)
  if (t === 13) return '1. ' + blockText(b)
  if (t === 14) { const c = blockText(b); return '```' + NL + c + NL + '```' }
  if (t === 15) return '> ' + blockText(b)
  if (t === 17) return '- [ ] ' + blockText(b)
  if (t === 19) return blockText(b)
  if (t === 22) return '---'
  if (b.image && b.image.token) return '[[IMG:' + b.image.token + ']]'
  if (b.bitable && b.bitable.token) return '[[BITABLE:' + b.bitable.token + ']]'
  if (b.file && b.file.token) return '[文件: ' + (b.file.name || '') + ']'
  if (t === 21) return '[流程图]'
  return ''
}

function walkBlocks(blockMap, block) {
  if (block.block_type === 31) return renderTable(blockMap, block)
  const lines = []
  const r = renderBlock(block)
  if (r) lines.push(r)
  const children = block.children || []
  for (const cid of children) {
    const child = blockMap[cid]
    if (child) { const sub = walkBlocks(blockMap, child); if (sub) lines.push(sub) }
  }
  return lines.join(NL)
}

function renderDocument(blockMap, rootIds) {
  const parts = []
  for (const rid of rootIds) {
    const b = blockMap[rid]
    if (b) { const s = walkBlocks(blockMap, b); if (s) parts.push(s) }
  }
  return parts.join(NL + NL)
}

// ── 读取器 ───────────────────────────────────────────────────────────

async function readSheets(token, tokenStr) {
  let title = ''
  try {
    const meta = await feishu(token, '/sheets/v3/spreadsheets/' + encodeURIComponent(tokenStr))
    if (meta && meta.spreadsheet && meta.spreadsheet.title) title = meta.spreadsheet.title
  } catch (e) { /* ignore */ }
  const q = await feishu(token, '/sheets/v3/spreadsheets/' + encodeURIComponent(tokenStr) + '/sheets/query')
  const sheets = (q && q.sheets) || []
  let out = title ? ('# ' + title + NL + NL) : ''
  for (const sh of sheets) {
    const sid = sh.sheet_id
    out += '## ' + (sh.title || sid) + NL + NL
    try {
      const range = sid + '!A1:' + colLetter(CAP_COLS - 1) + String(CAP_ROWS)
      const v = await feishu(token, '/sheets/v2/spreadsheets/' + encodeURIComponent(tokenStr) + '/values/' + range)
      const values = (v && v.valueRange && v.valueRange.values) || []
      out += valuesToTable(values) + NL + NL
    } catch (e) {
      out += '(读取失败：' + (e && e.message ? e.message : String(e)) + ')' + NL + NL
    }
  }
  return out || '(无工作表)'
}

function colLetter(n) {
  let s = ''
  n = n + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function readBitableTable(token, appToken, tableId) {
  const fd = await feishu(token, '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables/' + encodeURIComponent(tableId) + '/fields')
  const fields = (fd && fd.items) || []
  const names = fields.map((f) => f.field_name)
  const records = []
  let pageToken = null
  while (records.length < CAP_RECORDS) {
    let p = '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables/' + encodeURIComponent(tableId) + '/records?page_size=100'
    if (pageToken) p += '&page_token=' + encodeURIComponent(pageToken)
    const d = await feishu(token, p)
    const items = (d && d.items) || []
    for (const it of items) { if (records.length < CAP_RECORDS) records.push(it.fields || {}) }
    if (!d || !d.has_more || !d.page_token) break
    pageToken = d.page_token
  }
  const seen = {}
  const headers = names.slice()
  for (const rec of records) {
    for (const k in rec) {
      if (k !== 'record_id' && !seen[k]) { seen[k] = true; headers.push(k) }
    }
  }
  const rows = records.map((rec) => headers.map((h) => rec[h]))
  return toTable(headers, rows)
}

async function readBitable(token, appToken) {
  let title = ''
  try {
    const meta = await feishu(token, '/bitable/v1/apps/' + encodeURIComponent(appToken))
    if (meta && meta.app && meta.app.name) title = meta.app.name
  } catch (e) { /* ignore */ }
  const td = await feishu(token, '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables')
  const tables = (td && td.items) || []
  let out = title ? ('# ' + title + NL + NL) : ''
  for (const tb of tables) {
    out += '## ' + (tb.name || tb.table_id) + NL + NL
    out += await readBitableTable(token, appToken, tb.table_id) + NL + NL
  }
  return out || '(无数据表)'
}

async function readDocx(token, docId) {
  const cached = cacheGet(docId)
  if (cached) return cached

  let title = ''
  try {
    const meta = await feishu(token, '/docx/v1/documents/' + encodeURIComponent(docId))
    if (meta && meta.document && meta.document.title) title = meta.document.title
  } catch (e) { /* ignore */ }

  const blocks = await readBlocks(token, docId)
  const blockMap = {}
  const rootIds = []
  for (const b of blocks) {
    blockMap[b.block_id] = b
    if (b.parent_id === docId) rootIds.push(b.block_id)
  }

  let markdown = title ? ('# ' + title + NL + NL) : ''
  markdown += renderDocument(blockMap, rootIds)

  cleanupDir(outDir, TTL_MS)
  cleanupDir(cacheDir, CACHE_TTL_MS)

  // 图片
  const imageTokens = []
  for (const b of blocks) {
    if (b.image && b.image.token && imageTokens.indexOf(b.image.token) < 0) imageTokens.push(b.image.token)
  }
  const images = []
  for (let k = 0; k < imageTokens.length && k < CAP_IMAGES; k++) {
    const tk = imageTokens[k]
    const cachedFile = findCached(tk)
    if (cachedFile) {
      images.push({ n: k + 1, path: cachedFile })
      markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k + 1) + '】本地路径：' + cachedFile + NL + NL)
      markdown = markdown.split('[[CELLIMG:' + tk + ']]').join('<br>[图片 ' + (k + 1) + ': ' + cachedFile + ']')
    } else {
      try {
        const dl = await downloadImage(token, tk)
        const fp = path.join(outDir, tk + dl.ext)
        fs.writeFileSync(fp, dl.buf)
        images.push({ n: k + 1, path: fp })
        markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k + 1) + '】本地路径：' + fp + NL + NL)
        markdown = markdown.split('[[CELLIMG:' + tk + ']]').join('<br>[图片 ' + (k + 1) + ': ' + fp + ']')
      } catch (e) {
        markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k + 1) + '】下载失败：' + (e && e.message ? e.message : String(e)) + NL + NL)
        markdown = markdown.split('[[CELLIMG:' + tk + ']]').join('<br>[图片 ' + (k + 1) + ': 下载失败]')
      }
    }
  }
  if (imageTokens.length > CAP_IMAGES) markdown += NL + '（还有 ' + (imageTokens.length - CAP_IMAGES) + ' 张图片未下载，超过上限）'

  // 内嵌多维表格
  const bitableTokens = []
  for (const b of blocks) {
    if (b.bitable && b.bitable.token && bitableTokens.indexOf(b.bitable.token) < 0) bitableTokens.push(b.bitable.token)
  }
  for (const bt of bitableTokens) {
    try {
      const content = await readBitable(token, bt)
      markdown = markdown.split('[[BITABLE:' + bt + ']]').join(NL + NL + content + NL + NL)
    } catch (e) {
      markdown = markdown.split('[[BITABLE:' + bt + ']]').join(NL + NL + '[内嵌多维表格读取失败：' + (e && e.message ? e.message : String(e)) + ']' + NL + NL)
    }
  }

  const result = { markdown, images }
  cacheSet(docId, result)
  return result
}

async function listWikiChildren(token, spaceId, parentToken) {
  const d = await feishu(token, '/wiki/v2/spaces/' + encodeURIComponent(spaceId) + '/nodes?parent_node_token=' + encodeURIComponent(parentToken))
  return (d && d.items) || []
}

async function readWiki(token, nodeToken) {
  const nd = await feishu(token, '/wiki/v2/spaces/get_node?token=' + encodeURIComponent(nodeToken))
  const node = nd && nd.node
  if (!node) throw new Error('无法解析知识库节点')
  const objType = node.obj_type
  const objToken = node.obj_token
  const title = node.title || ''
  const spaceId = node.space_id
  if (objType === 'docx' || objType === 'doc') {
    const r = await readDocx(token, objToken)
    return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + r.markdown, images: r.images }
  }
  if (objType === 'sheet') return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + await readSheets(token, objToken), images: [] }
  if (objType === 'bitable') return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + await readBitable(token, objToken), images: [] }
  const children = await listWikiChildren(token, spaceId, nodeToken)
  let out = '# ' + (title || '知识库目录') + NL + NL
  out += '该节点是目录或容器（类型：' + (objType || '未知') + '），无法直接读取正文。子节点如下：' + NL + NL
  for (const c of children) out += '- ' + (c.title || '(无标题)') + '（' + (c.obj_type || '未知') + '）' + NL
  if (!children.length) out += '(无子节点)' + NL
  return { markdown: out, images: [] }
}

// ── runner ───────────────────────────────────────────────────────────

export async function run(input) {
  const token = await getToken(input.appId, input.appSecret)
  const link = parseLink(input.url)
  let result
  if (link.type === 'wiki') result = await readWiki(token, link.token)
  else if (link.type === 'sheets') result = { markdown: await readSheets(token, link.token), images: [] }
  else if (link.type === 'bitable') result = { markdown: await readBitable(token, link.token), images: [] }
  else if (link.type === 'docx') result = await readDocx(token, link.token)
  else result = { markdown: '暂不支持该文档类型（' + link.type + '）。当前支持：docx（云文档）、wiki（知识库）、sheets（电子表格）、bitable（多维表格）。', images: [] }
  if (result.markdown.length > CAP_CHARS) result.markdown = result.markdown.slice(0, CAP_CHARS) + NL + NL + '…（内容过长，已截断）'
  return { ok: true, markdown: result.markdown, images: result.images }
}

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  try {
    const result = await run(input)
    console.log(JSON.stringify(result))
  } catch (e) {
    fail(e && e.message ? e.message : String(e))
  }
}

// CLI 入口：作为文件运行（node script.js）或经 -e 内嵌运行（argv[1] === 'run'）时执行；
// 被 import（单元测试/插件）时不执行。
const IS_CLI = process.argv[1] === 'run' || (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
if (IS_CLI) {
  main()
}
