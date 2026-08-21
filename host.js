// 生成文件：由 scripts/build-dynamic.mjs 生成，勿手改。
// 动态版 Host 半部（cordis_define 的 code.host 用）。引擎逻辑单一来源：lib/script.js。
// 安全：凭证经 stdin 传给引擎子进程，不落命令行。
module.exports = function feishuReaderHost() {
  return {
    apply(ctx) {
      const subprocess = ctx.get('subprocess')
      const credentials = ctx.get('credentials')
      const sandboxPolicy = ctx.get('sandboxPolicy')
      const settings = ctx.get('settings')

      const script = "// 飞书文档读取引擎 —— 纯函数 + CLI runner（单一来源）\n//\n// 安全：凭证通过 **stdin** 传入（不落命令行参数）。\n// 亮点：Markdown 表格（合并格内容重复不丢失）、单元格图片路径引用、\n//       行内格式（粗体/行内代码/链接）、文档内容缓存（10 分钟 TTL）、\n//       内嵌多维表格、文件块占位。\n//\n// 既可被 lib/index.js spawn 执行（node script.js < input.json），\n// 也可 import 纯函数供单元测试使用。\nimport fs from 'node:fs'\nimport path from 'node:path'\nimport os from 'node:os'\nimport { fileURLToPath } from 'node:url'\n\nconst BASE = 'https://open.feishu.cn/open-apis'\nconst NL = String.fromCharCode(10)\nconst TTL_MS = 24 * 60 * 60 * 1000            // 图片缓存 TTL\nconst CACHE_TTL_MS = 10 * 60 * 1000           // 文档内容缓存 TTL\nconst CAP_ROWS = 500\nconst CAP_COLS = 60\nconst CAP_RECORDS = 500\nconst CAP_CHARS = 400000\nconst CAP_IMAGES = 30\n\nconst outDir = path.join(os.tmpdir(), 'dsh-feishu-images')\nconst cacheDir = path.join(os.tmpdir(), 'dsh-feishu-cache')\ntry { fs.mkdirSync(outDir, { recursive: true }) } catch (e) {}\ntry { fs.mkdirSync(cacheDir, { recursive: true }) } catch (e) {}\n\n// ── 纯函数（可测试） ────────────────────────────────────────────────\n\nexport function parseLink(url) {\n  const u = String(url).trim()\n  const markers = [\n    ['/wiki/', 'wiki'], ['/sheets/', 'sheets'], ['/base/', 'bitable'],\n    ['/bitable/', 'bitable'], ['/docx/', 'docx'], ['/docs/', 'docx'],\n    ['/mindnotes/', 'other'], ['/slides/', 'other'], ['/minutes/', 'other'], ['/file/', 'other']\n  ]\n  let seg = null\n  let type = null\n  for (const [marker, t] of markers) {\n    if (u.indexOf(marker) >= 0) { seg = marker; type = t; break }\n  }\n  if (seg !== null) {\n    let rest = u.slice(u.indexOf(seg) + seg.length)\n    let cut = rest.length\n    const q = rest.indexOf('?'); if (q >= 0 && q < cut) cut = q\n    const h = rest.indexOf('#'); if (h >= 0 && h < cut) cut = h\n    rest = rest.slice(0, cut)\n    while (rest.charAt(0) === '/') rest = rest.slice(1)\n    while (rest.charAt(rest.length - 1) === '/') rest = rest.slice(0, rest.length - 1)\n    if (rest) return { type, token: rest }\n  }\n  let bare = u.length >= 8\n  for (let j = 0; j < u.length; j++) {\n    const c = u.charAt(j)\n    const ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-'\n    if (!ok) { bare = false; break }\n  }\n  if (bare) return { type: 'docx', token: u }\n  throw new Error('无法识别的飞书链接：' + u)\n}\n\nexport function scalar(v) {\n  if (v === null || v === undefined) return ''\n  if (Array.isArray(v)) return v.map(scalar).join(', ')\n  if (typeof v === 'object') return JSON.stringify(v)\n  return String(v)\n}\n\nexport function esc(s) {\n  let str = String(s)\n  let out = ''\n  for (let i = 0; i < str.length; i++) {\n    const c = str.charAt(i)\n    if (c === '|') out += '&#124;'\n    else if (c === String.fromCharCode(10)) out += '<br>'\n    else if (c === String.fromCharCode(13)) { /* drop CR */ }\n    else out += c\n  }\n  return out\n}\n\nexport function toTable(headers, rows) {\n  const h = headers.map(String)\n  const lines = []\n  lines.push('| ' + h.map(esc).join(' | ') + ' |')\n  lines.push('| ' + h.map(() => '---').join(' | ') + ' |')\n  for (const row of rows) {\n    const cells = []\n    for (let j = 0; j < h.length; j++) cells.push(esc(scalar(row[j])))\n    lines.push('| ' + cells.join(' | ') + ' |')\n  }\n  return lines.join(NL)\n}\n\nexport function styledText(content, style) {\n  let inner = content || ''\n  if (style) {\n    if (style.inline_code) inner = '`' + inner + '`'\n    if (style.bold) inner = '**' + inner + '**'\n    if (style.italic) inner = '*' + inner + '*'\n    if (style.strike) inner = '~~' + inner + '~~'\n  }\n  if (style && style.link && style.link.url) return '[' + inner + '](' + style.link.url + ')'\n  return inner\n}\n\nexport function textContent(t) {\n  if (!t || !t.elements) return ''\n  let out = ''\n  for (const el of t.elements) {\n    if (el.text_run) out += styledText(el.text_run.content, el.text_run.text_element_style)\n    else if (el.mention_doc) out += el.mention_doc.title || ''\n    else if (el.mention_user) out += '[用户]'\n    else if (el.equation) out += el.equation.content || ''\n    else if (el.reminder) out += '[提醒]'\n    else if (el.inline_file) out += '[文件]'\n  }\n  return out\n}\n\nexport function blockText(b) {\n  const fields = [\n    'text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5',\n    'heading6', 'heading7', 'heading8', 'heading9', 'bullet', 'ordered',\n    'todo', 'quote', 'code', 'callout'\n  ]\n  for (const f of fields) {\n    const v = b[f]\n    if (v && v.elements) return textContent(v)\n  }\n  return ''\n}\n\nexport function cellText(blockMap, cellId) {\n  const cell = blockMap[cellId]\n  if (!cell) return ''\n  const parts = []\n  for (const cid of (cell.children || [])) {\n    const ch = blockMap[cid]\n    if (!ch) continue\n    if (ch.image && ch.image.token) { parts.push('[[CELLIMG:' + ch.image.token + ']]'); continue }\n    if (ch.bitable && ch.bitable.token) { parts.push('[内嵌表格]'); continue }\n    const txt = blockText(ch)\n    if (txt) parts.push(txt)\n  }\n  return parts.join('<br>')\n}\n\nexport function renderTable(blockMap, tb) {\n  const t = tb.table || {}\n  const cells = t.cells || []\n  const prop = t.property || {}\n  const rows = prop.row_size || 0\n  const cols = prop.column_size || 0\n  if (!cells.length || !rows || !cols) return ''\n  const mergeInfo = prop.merge_info || []\n  const grid = []\n  for (let r = 0; r < rows; r++) {\n    const row = []\n    for (let c = 0; c < cols; c++) {\n      const idx = r * cols + c\n      row.push(cells[idx] ? cellText(blockMap, cells[idx]) : '')\n    }\n    grid.push(row)\n  }\n  // 合并单元格：把主单元格内容复制到覆盖位置（Markdown 无法表达合并，但不丢信息）\n  for (let r = 0; r < rows; r++) {\n    for (let c = 0; c < cols; c++) {\n      const mi = mergeInfo[r * cols + c]\n      if (!mi) continue\n      const cs = mi.col_span || 1\n      const rs = mi.row_span || 1\n      if (cs > 1 || rs > 1) {\n        const text = grid[r][c]\n        for (let rr = r; rr < Math.min(rows, r + rs); rr++) {\n          for (let cc = c; cc < Math.min(cols, c + cs); cc++) {\n            if (rr === r && cc === c) continue\n            grid[rr][cc] = text\n          }\n        }\n      }\n    }\n  }\n  const headerRow = prop.header_row ? grid[0] : null\n  const body = headerRow ? grid.slice(1) : grid\n  if (headerRow) return toTable(headerRow.map(String), body)\n  const headers = []\n  for (let j = 0; j < cols; j++) headers.push('列' + (j + 1))\n  return toTable(headers, grid)\n}\n\nexport function valuesToTable(values) {\n  if (!values || !values.length) return '(空表格)'\n  const rows = values.slice(0, CAP_ROWS).map((r) => (r || []).slice(0, CAP_COLS))\n  const headers = rows[0].map((c, i) => (c === null || c === undefined) ? ('列' + (i + 1)) : String(c))\n  return toTable(headers, rows.slice(1).map((r) => r.map(scalar)))\n}\n\n// ── 内部工具 ─────────────────────────────────────────────────────────\n\nfunction fail(msg) {\n  console.log(JSON.stringify({ ok: false, error: String(msg) }))\n  process.exit(0)\n}\n\nfunction cleanupDir(dir, ttlMs) {\n  let files = []\n  try { files = fs.readdirSync(dir) } catch (e) { return }\n  const now = Date.now()\n  for (const f of files) {\n    const fp = path.join(dir, f)\n    try {\n      const st = fs.statSync(fp)\n      if (now - st.mtimeMs > ttlMs) fs.unlinkSync(fp)\n    } catch (e) { /* ignore */ }\n  }\n}\n\nfunction findCached(token) {\n  const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp']\n  for (const ext of exts) {\n    const p = path.join(outDir, token + ext)\n    try { if (fs.existsSync(p)) return p } catch (e) { /* ignore */ }\n  }\n  return null\n}\n\nfunction cacheGet(key) {\n  const fp = path.join(cacheDir, key + '.json')\n  try {\n    const st = fs.statSync(fp)\n    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) { fs.unlinkSync(fp); return null }\n    return JSON.parse(fs.readFileSync(fp, 'utf8'))\n  } catch (e) { return null }\n}\n\nfunction cacheSet(key, value) {\n  try { fs.writeFileSync(path.join(cacheDir, key + '.json'), JSON.stringify(value)) } catch (e) { /* ignore */ }\n}\n\nasync function feishu(token, pathName, init) {\n  const headers = token ? { Authorization: 'Bearer ' + token } : {}\n  const res = await fetch(BASE + pathName, Object.assign({ headers, signal: AbortSignal.timeout(30000) }, init || {}))\n  const text = await res.text()\n  let json = null\n  try { json = JSON.parse(text) } catch (e) { /* not json */ }\n  if (json && typeof json.code === 'number' && json.code !== 0) {\n    throw new Error('飞书接口错误 ' + pathName + '：' + (json.msg || ('code ' + json.code)))\n  }\n  if (!res.ok && !json) throw new Error('HTTP ' + res.status + ' ' + pathName)\n  return json ? json.data : null\n}\n\nasync function getToken(appId, appSecret) {\n  const res = await fetch(BASE + '/auth/v3/tenant_access_token/internal', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),\n    signal: AbortSignal.timeout(30000)\n  })\n  const json = await res.json()\n  if (!json || json.code !== 0) {\n    throw new Error('获取 tenant_access_token 失败：' + ((json && json.msg) || ('HTTP ' + res.status)) + (json && json.code ? (' (code ' + json.code + ')') : ''))\n  }\n  return json.tenant_access_token\n}\n\nasync function readBlocks(token, docId) {\n  const all = []\n  let pageToken = null\n  while (true) {\n    let p = '/docx/v1/documents/' + encodeURIComponent(docId) + '/blocks?page_size=500'\n    if (pageToken) p += '&page_token=' + encodeURIComponent(pageToken)\n    const d = await feishu(token, p)\n    const items = (d && d.items) || []\n    for (const it of items) all.push(it)\n    if (!d || !d.has_more || !d.page_token) break\n    pageToken = d.page_token\n  }\n  return all\n}\n\nasync function downloadImage(token, fileToken) {\n  const res = await fetch(BASE + '/drive/v1/medias/' + encodeURIComponent(fileToken) + '/download', {\n    headers: { Authorization: 'Bearer ' + token },\n    signal: AbortSignal.timeout(60000)\n  })\n  if (!res.ok) throw new Error('HTTP ' + res.status)\n  const buf = Buffer.from(await res.arrayBuffer())\n  const ct = res.headers.get('content-type') || ''\n  let ext = '.png'\n  if (ct.indexOf('jpeg') >= 0 || ct.indexOf('jpg') >= 0) ext = '.jpg'\n  else if (ct.indexOf('gif') >= 0) ext = '.gif'\n  else if (ct.indexOf('webp') >= 0) ext = '.webp'\n  return { buf, ext }\n}\n\n// ── 渲染 ─────────────────────────────────────────────────────────────\n\nfunction headingMark(n) { let s = ''; for (let i = 0; i < n; i++) s += '#'; return s }\n\nfunction renderBlock(b) {\n  const t = b.block_type\n  if (t >= 3 && t <= 11) { const h = blockText(b); return h ? (headingMark(t - 2) + ' ' + h) : '' }\n  if (t === 2) return blockText(b)\n  if (t === 12) return '- ' + blockText(b)\n  if (t === 13) return '1. ' + blockText(b)\n  if (t === 14) { const c = blockText(b); return '```' + NL + c + NL + '```' }\n  if (t === 15) return '> ' + blockText(b)\n  if (t === 17) return '- [ ] ' + blockText(b)\n  if (t === 19) return blockText(b)\n  if (t === 22) return '---'\n  if (b.image && b.image.token) return '[[IMG:' + b.image.token + ']]'\n  if (b.bitable && b.bitable.token) return '[[BITABLE:' + b.bitable.token + ']]'\n  if (b.file && b.file.token) return '[文件: ' + (b.file.name || '') + ']'\n  if (t === 21) return '[流程图]'\n  return ''\n}\n\nfunction walkBlocks(blockMap, block) {\n  if (block.block_type === 31) return renderTable(blockMap, block)\n  const lines = []\n  const r = renderBlock(block)\n  if (r) lines.push(r)\n  const children = block.children || []\n  for (const cid of children) {\n    const child = blockMap[cid]\n    if (child) { const sub = walkBlocks(blockMap, child); if (sub) lines.push(sub) }\n  }\n  return lines.join(NL)\n}\n\nfunction renderDocument(blockMap, rootIds) {\n  const parts = []\n  for (const rid of rootIds) {\n    const b = blockMap[rid]\n    if (b) { const s = walkBlocks(blockMap, b); if (s) parts.push(s) }\n  }\n  return parts.join(NL + NL)\n}\n\n// ── 读取器 ───────────────────────────────────────────────────────────\n\nasync function readSheets(token, tokenStr) {\n  let title = ''\n  try {\n    const meta = await feishu(token, '/sheets/v3/spreadsheets/' + encodeURIComponent(tokenStr))\n    if (meta && meta.spreadsheet && meta.spreadsheet.title) title = meta.spreadsheet.title\n  } catch (e) { /* ignore */ }\n  const q = await feishu(token, '/sheets/v3/spreadsheets/' + encodeURIComponent(tokenStr) + '/sheets/query')\n  const sheets = (q && q.sheets) || []\n  let out = title ? ('# ' + title + NL + NL) : ''\n  for (const sh of sheets) {\n    const sid = sh.sheet_id\n    out += '## ' + (sh.title || sid) + NL + NL\n    try {\n      const range = sid + '!A1:' + colLetter(CAP_COLS - 1) + String(CAP_ROWS)\n      const v = await feishu(token, '/sheets/v2/spreadsheets/' + encodeURIComponent(tokenStr) + '/values/' + range)\n      const values = (v && v.valueRange && v.valueRange.values) || []\n      out += valuesToTable(values) + NL + NL\n    } catch (e) {\n      out += '(读取失败：' + (e && e.message ? e.message : String(e)) + ')' + NL + NL\n    }\n  }\n  return out || '(无工作表)'\n}\n\nfunction colLetter(n) {\n  let s = ''\n  n = n + 1\n  while (n > 0) {\n    const m = (n - 1) % 26\n    s = String.fromCharCode(65 + m) + s\n    n = Math.floor((n - 1) / 26)\n  }\n  return s\n}\n\nasync function readBitableTable(token, appToken, tableId) {\n  const fd = await feishu(token, '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables/' + encodeURIComponent(tableId) + '/fields')\n  const fields = (fd && fd.items) || []\n  const names = fields.map((f) => f.field_name)\n  const records = []\n  let pageToken = null\n  while (records.length < CAP_RECORDS) {\n    let p = '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables/' + encodeURIComponent(tableId) + '/records?page_size=100'\n    if (pageToken) p += '&page_token=' + encodeURIComponent(pageToken)\n    const d = await feishu(token, p)\n    const items = (d && d.items) || []\n    for (const it of items) { if (records.length < CAP_RECORDS) records.push(it.fields || {}) }\n    if (!d || !d.has_more || !d.page_token) break\n    pageToken = d.page_token\n  }\n  const seen = {}\n  const headers = names.slice()\n  for (const rec of records) {\n    for (const k in rec) {\n      if (k !== 'record_id' && !seen[k]) { seen[k] = true; headers.push(k) }\n    }\n  }\n  const rows = records.map((rec) => headers.map((h) => rec[h]))\n  return toTable(headers, rows)\n}\n\nasync function readBitable(token, appToken) {\n  let title = ''\n  try {\n    const meta = await feishu(token, '/bitable/v1/apps/' + encodeURIComponent(appToken))\n    if (meta && meta.app && meta.app.name) title = meta.app.name\n  } catch (e) { /* ignore */ }\n  const td = await feishu(token, '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables')\n  const tables = (td && td.items) || []\n  let out = title ? ('# ' + title + NL + NL) : ''\n  for (const tb of tables) {\n    out += '## ' + (tb.name || tb.table_id) + NL + NL\n    out += await readBitableTable(token, appToken, tb.table_id) + NL + NL\n  }\n  return out || '(无数据表)'\n}\n\nasync function readDocx(token, docId) {\n  const cached = cacheGet(docId)\n  if (cached) return cached\n\n  let title = ''\n  try {\n    const meta = await feishu(token, '/docx/v1/documents/' + encodeURIComponent(docId))\n    if (meta && meta.document && meta.document.title) title = meta.document.title\n  } catch (e) { /* ignore */ }\n\n  const blocks = await readBlocks(token, docId)\n  const blockMap = {}\n  const rootIds = []\n  for (const b of blocks) {\n    blockMap[b.block_id] = b\n    if (b.parent_id === docId) rootIds.push(b.block_id)\n  }\n\n  let markdown = title ? ('# ' + title + NL + NL) : ''\n  markdown += renderDocument(blockMap, rootIds)\n\n  cleanupDir(outDir, TTL_MS)\n  cleanupDir(cacheDir, CACHE_TTL_MS)\n\n  // 图片\n  const imageTokens = []\n  for (const b of blocks) {\n    if (b.image && b.image.token && imageTokens.indexOf(b.image.token) < 0) imageTokens.push(b.image.token)\n  }\n  const images = []\n  for (let k = 0; k < imageTokens.length && k < CAP_IMAGES; k++) {\n    const tk = imageTokens[k]\n    const cachedFile = findCached(tk)\n    if (cachedFile) {\n      images.push({ n: k + 1, path: cachedFile })\n      markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k + 1) + '】本地路径：' + cachedFile + NL + NL)\n      markdown = markdown.split('[[CELLIMG:' + tk + ']]').join('<br>[图片 ' + (k + 1) + ': ' + cachedFile + ']')\n    } else {\n      try {\n        const dl = await downloadImage(token, tk)\n        const fp = path.join(outDir, tk + dl.ext)\n        fs.writeFileSync(fp, dl.buf)\n        images.push({ n: k + 1, path: fp })\n        markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k + 1) + '】本地路径：' + fp + NL + NL)\n        markdown = markdown.split('[[CELLIMG:' + tk + ']]').join('<br>[图片 ' + (k + 1) + ': ' + fp + ']')\n      } catch (e) {\n        markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k + 1) + '】下载失败：' + (e && e.message ? e.message : String(e)) + NL + NL)\n        markdown = markdown.split('[[CELLIMG:' + tk + ']]').join('<br>[图片 ' + (k + 1) + ': 下载失败]')\n      }\n    }\n  }\n  if (imageTokens.length > CAP_IMAGES) markdown += NL + '（还有 ' + (imageTokens.length - CAP_IMAGES) + ' 张图片未下载，超过上限）'\n\n  // 内嵌多维表格\n  const bitableTokens = []\n  for (const b of blocks) {\n    if (b.bitable && b.bitable.token && bitableTokens.indexOf(b.bitable.token) < 0) bitableTokens.push(b.bitable.token)\n  }\n  for (const bt of bitableTokens) {\n    try {\n      const content = await readBitable(token, bt)\n      markdown = markdown.split('[[BITABLE:' + bt + ']]').join(NL + NL + content + NL + NL)\n    } catch (e) {\n      markdown = markdown.split('[[BITABLE:' + bt + ']]').join(NL + NL + '[内嵌多维表格读取失败：' + (e && e.message ? e.message : String(e)) + ']' + NL + NL)\n    }\n  }\n\n  const result = { markdown, images }\n  cacheSet(docId, result)\n  return result\n}\n\nasync function listWikiChildren(token, spaceId, parentToken) {\n  const d = await feishu(token, '/wiki/v2/spaces/' + encodeURIComponent(spaceId) + '/nodes?parent_node_token=' + encodeURIComponent(parentToken))\n  return (d && d.items) || []\n}\n\nasync function readWiki(token, nodeToken) {\n  const nd = await feishu(token, '/wiki/v2/spaces/get_node?token=' + encodeURIComponent(nodeToken))\n  const node = nd && nd.node\n  if (!node) throw new Error('无法解析知识库节点')\n  const objType = node.obj_type\n  const objToken = node.obj_token\n  const title = node.title || ''\n  const spaceId = node.space_id\n  if (objType === 'docx' || objType === 'doc') {\n    const r = await readDocx(token, objToken)\n    return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + r.markdown, images: r.images }\n  }\n  if (objType === 'sheet') return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + await readSheets(token, objToken), images: [] }\n  if (objType === 'bitable') return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + await readBitable(token, objToken), images: [] }\n  const children = await listWikiChildren(token, spaceId, nodeToken)\n  let out = '# ' + (title || '知识库目录') + NL + NL\n  out += '该节点是目录或容器（类型：' + (objType || '未知') + '），无法直接读取正文。子节点如下：' + NL + NL\n  for (const c of children) out += '- ' + (c.title || '(无标题)') + '（' + (c.obj_type || '未知') + '）' + NL\n  if (!children.length) out += '(无子节点)' + NL\n  return { markdown: out, images: [] }\n}\n\n// ── runner ───────────────────────────────────────────────────────────\n\nexport async function run(input) {\n  const token = await getToken(input.appId, input.appSecret)\n  const link = parseLink(input.url)\n  let result\n  if (link.type === 'wiki') result = await readWiki(token, link.token)\n  else if (link.type === 'sheets') result = { markdown: await readSheets(token, link.token), images: [] }\n  else if (link.type === 'bitable') result = { markdown: await readBitable(token, link.token), images: [] }\n  else if (link.type === 'docx') result = await readDocx(token, link.token)\n  else result = { markdown: '暂不支持该文档类型（' + link.type + '）。当前支持：docx（云文档）、wiki（知识库）、sheets（电子表格）、bitable（多维表格）。', images: [] }\n  if (result.markdown.length > CAP_CHARS) result.markdown = result.markdown.slice(0, CAP_CHARS) + NL + NL + '…（内容过长，已截断）'\n  return { ok: true, markdown: result.markdown, images: result.images }\n}\n\nasync function main() {\n  const chunks = []\n  for await (const chunk of process.stdin) chunks.push(chunk)\n  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))\n  try {\n    const result = await run(input)\n    console.log(JSON.stringify(result))\n  } catch (e) {\n    fail(e && e.message ? e.message : String(e))\n  }\n}\n\n// CLI 入口：作为文件运行（node script.js）或经 -e 内嵌运行（argv[1] === 'run'）时执行；\n// 被 import（单元测试/插件）时不执行。\nconst IS_CLI = process.argv[1] === 'run' || (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))\nif (IS_CLI) {\n  main()\n}\n"

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
