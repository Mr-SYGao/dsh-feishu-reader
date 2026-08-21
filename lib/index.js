// 飞书文档读取插件 — Host 半部（真实 Cordis 插件包）
//
// 与动态版（cordis_define）的区别：
// - 使用真实库 API：defineTool（@deepseek-ai/dsh-tools）+ ctx.tools.register
// - 设置命名空间 feishu 用真实 schemastery schema（appId + appSecret，secret 角色）
// - 凭证规范存储：设置命名空间 feishu（settings.yaml），兼容回退到凭证库 FEISHU_APP_ID/SECRET
// - 组合加载：在 cordis.patch.yml 插入一行 name 指向本包即可
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'feishu-reader'
export const inject = ['tools', 'settings']
export const Config = z.object({})

const script = [
"const fs = require('fs');",
"const path = require('path');",
"const os = require('os');",
"const input = JSON.parse(process.argv[1]);",
"const BASE = 'https://open.feishu.cn/open-apis';",
"const NL = String.fromCharCode(10);",
"const TTL_MS = 24 * 60 * 60 * 1000;",
"const outDir = path.join(os.tmpdir(), 'dsh-feishu-images');",
"try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}",
"const CAP_ROWS = 500, CAP_COLS = 60, CAP_RECORDS = 500, CAP_CHARS = 400000, CAP_IMAGES = 30;",
"function fail(msg){ console.log(JSON.stringify({ok:false, error:String(msg)})); process.exit(0); }",
"function cleanupCache(ttlMs){",
"  var now = Date.now();",
"  var files = [];",
"  try { files = fs.readdirSync(outDir); } catch (e) { return; }",
"  for (var i=0;i<files.length;i++){",
"    var fp = path.join(outDir, files[i]);",
"    try { var st = fs.statSync(fp); if (now - st.mtimeMs > ttlMs) fs.unlinkSync(fp); } catch (e) {}",
"  }",
"}",
"function findCached(token){",
"  var exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];",
"  for (var i=0;i<exts.length;i++){",
"    var p = path.join(outDir, token + exts[i]);",
"    try { if (fs.existsSync(p)) return p; } catch (e) {}",
"  }",
"  return null;",
"}",
"function esc(s){",
"  var str = String(s); var out = '';",
"  for (var i=0;i<str.length;i++){",
"    var c = str.charAt(i);",
"    if (c === '|') out += '&#124;';",
"    else if (c === String.fromCharCode(10)) out += '<br>';",
"    else if (c === String.fromCharCode(13)) {}",
"    else out += c;",
"  }",
"  return out;",
"}",
"function scalar(v){",
"  if (v === null || v === undefined) return '';",
"  if (Array.isArray(v)) return v.map(scalar).join(', ');",
"  if (typeof v === 'object') return JSON.stringify(v);",
"  return String(v);",
"}",
"function toTable(headers, rows){",
"  var h = headers.map(String);",
"  var lines = [];",
"  lines.push('| ' + h.map(esc).join(' | ') + ' |');",
"  lines.push('| ' + h.map(function(){ return '---'; }).join(' | ') + ' |');",
"  for (var i=0;i<rows.length;i++){",
"    var cells = [];",
"    for (var j=0;j<h.length;j++){ cells.push(esc(scalar(rows[i][j]))); }",
"    lines.push('| ' + cells.join(' | ') + ' |');",
"  }",
"  return lines.join(NL);",
"}",
"function colLetter(n){",
"  var s = ''; n = n + 1;",
"  while (n > 0){ var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }",
"  return s;",
"}",
"function parseLink(url){",
"  var u = String(url).trim();",
"  var markers = [['/wiki/','wiki'],['/sheets/','sheets'],['/base/','bitable'],['/bitable/','bitable'],['/docx/','docx'],['/docs/','docx'],['/mindnotes/','other'],['/slides/','other'],['/minutes/','other'],['/file/','other']];",
"  var seg = null, type = null;",
"  for (var i=0;i<markers.length;i++){ if (u.indexOf(markers[i][0]) >= 0){ seg = markers[i][0]; type = markers[i][1]; break; } }",
"  if (seg !== null){",
"    var rest = u.slice(u.indexOf(seg) + seg.length);",
"    var cut = rest.length;",
"    var q = rest.indexOf('?'); if (q >= 0 && q < cut) cut = q;",
"    var hsh = rest.indexOf('#'); if (hsh >= 0 && hsh < cut) cut = hsh;",
"    rest = rest.slice(0, cut);",
"    while (rest.charAt(0) === '/') rest = rest.slice(1);",
"    while (rest.charAt(rest.length - 1) === '/') rest = rest.slice(0, rest.length - 1);",
"    if (rest) return { type: type, token: rest };",
"  }",
"  var bare = u.length >= 8;",
"  for (var j=0;j<u.length;j++){",
"    var c = u.charAt(j);",
"    var ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-';",
"    if (!ok){ bare = false; break; }",
"  }",
"  if (bare) return { type: 'docx', token: u };",
"  throw new Error('无法识别的飞书链接：' + u);",
"}",
"async function feishu(path, token, init){",
"  var headers = token ? { 'Authorization': 'Bearer ' + token } : {};",
"  var res = await fetch(BASE + path, Object.assign({ headers: headers, signal: AbortSignal.timeout(30000) }, init || {}));",
"  var text = await res.text();",
"  var json = null; try { json = JSON.parse(text); } catch (e) {}",
"  if (json && typeof json.code === 'number' && json.code !== 0) throw new Error('飞书接口错误 ' + path + '：' + (json.msg || ('code ' + json.code)));",
"  if (!res.ok && !json) throw new Error('HTTP ' + res.status + ' ' + path);",
"  return json ? json.data : null;",
"}",
"async function getToken(appId, appSecret){",
"  var res = await fetch(BASE + '/auth/v3/tenant_access_token/internal', {",
"    method: 'POST', headers: { 'Content-Type': 'application/json' },",
"    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),",
"    signal: AbortSignal.timeout(30000)",
"  });",
"  var json = await res.json();",
"  if (!json || json.code !== 0) throw new Error('获取 tenant_access_token 失败：' + ((json && json.msg) || ('HTTP ' + res.status)) + (json && json.code ? (' (code ' + json.code + ')') : ''));",
"  return json.tenant_access_token;",
"}",
"function textContent(t){",
"  if (!t || !t.elements) return '';",
"  var out = '';",
"  for (var i=0;i<t.elements.length;i++){",
"    var el = t.elements[i];",
"    if (el.text_run) out += el.text_run.content || '';",
"    else if (el.mention_doc) out += el.mention_doc.title || '';",
"    else if (el.mention_user) out += '[用户]';",
"    else if (el.equation) out += el.equation.content || '';",
"    else if (el.reminder) out += '[提醒]';",
"    else if (el.inline_file) out += '[文件]';",
"  }",
"  return out;",
"}",
"function blockText(b){",
"  var fields = ['text','heading1','heading2','heading3','heading4','heading5','heading6','heading7','heading8','heading9','bullet','ordered','todo','quote','code','callout'];",
"  for (var i=0;i<fields.length;i++){",
"    var v = b[fields[i]];",
"    if (v && v.elements) return textContent(v);",
"  }",
"  return '';",
"}",
"function headingMark(n){ var s=''; for (var i=0;i<n;i++) s += '#'; return s; }",
"function renderBlock(b){",
"  var t = b.block_type;",
"  if (t >= 3 && t <= 11){ var h = blockText(b); return h ? (headingMark(t-2) + ' ' + h) : ''; }",
"  if (t === 2) return blockText(b);",
"  if (t === 12) return '- ' + blockText(b);",
"  if (t === 13) return '1. ' + blockText(b);",
"  if (t === 14){ var c = blockText(b); return '```' + NL + c + NL + '```'; }",
"  if (t === 15) return '> ' + blockText(b);",
"  if (t === 17) return '- [ ] ' + blockText(b);",
"  if (t === 19) return blockText(b);",
"  if (t === 22) return '---';",
"  if (b.image && b.image.token) return '[[IMG:' + b.image.token + ']]';",
"  return '';",
"}",
"function cellText(blockMap, cellId){",
"  var cell = blockMap[cellId];",
"  if (!cell) return '';",
"  var children = cell.children || [];",
"  var parts = [];",
"  for (var i=0;i<children.length;i++){",
"    var ch = blockMap[children[i]];",
"    if (!ch) continue;",
"    if (ch.image && ch.image.token){ parts.push('[图片]'); continue; }",
"    var txt = blockText(ch);",
"    if (txt) parts.push(txt);",
"  }",
"  return parts.join('<br>');",
"}",
"function renderTable(blockMap, tb){",
"  var t = tb.table || {};",
"  var cells = t.cells || [];",
"  var prop = t.property || {};",
"  var rows = prop.row_size || 0;",
"  var cols = prop.column_size || 0;",
"  if (!cells.length || !rows || !cols) return '';",
"  var mergeInfo = prop.merge_info || [];",
"  var grid = [];",
"  for (var r=0;r<rows;r++){",
"    var row = [];",
"    for (var c=0;c<cols;c++){",
"      var idx = r*cols+c;",
"      var mi = mergeInfo[idx];",
"      if (mi && (mi.col_span === 0 || mi.row_span === 0)){ row.push(''); continue; }",
"      row.push(cells[idx] ? cellText(blockMap, cells[idx]) : '');",
"    }",
"    grid.push(row);",
"  }",
"  var headerRow = prop.header_row ? grid[0] : null;",
"  var body = headerRow ? grid.slice(1) : grid;",
"  if (headerRow){",
"    var hd = [];",
"    for (var i=0;i<headerRow.length;i++) hd.push(String(headerRow[i]));",
"    return toTable(hd, body);",
"  }",
"  var headers = [];",
"  for (var j=0;j<cols;j++) headers.push('列' + (j+1));",
"  return toTable(headers, grid);",
"}",
"function walkBlocks(blockMap, block){",
"  if (block.block_type === 31) return renderTable(blockMap, block);",
"  var lines = [];",
"  var r = renderBlock(block);",
"  if (r) lines.push(r);",
"  var children = block.children || [];",
"  for (var i=0;i<children.length;i++){",
"    var child = blockMap[children[i]];",
"    if (child){ var sub = walkBlocks(blockMap, child); if (sub) lines.push(sub); }",
"  }",
"  return lines.join(NL);",
"}",
"function renderDocument(blockMap, rootIds){",
"  var parts = [];",
"  for (var i=0;i<rootIds.length;i++){",
"    var b = blockMap[rootIds[i]];",
"    if (b){ var s = walkBlocks(blockMap, b); if (s) parts.push(s); }",
"  }",
"  return parts.join(NL + NL);",
"}",
"async function readBlocks(token, docId){",
"  var all = [];",
"  var pageToken = null;",
"  while (true){",
"    var p = '/docx/v1/documents/' + encodeURIComponent(docId) + '/blocks?page_size=500';",
"    if (pageToken) p += '&page_token=' + encodeURIComponent(pageToken);",
"    var d = await feishu(p, token);",
"    var items = (d && d.items) || [];",
"    for (var i=0;i<items.length;i++) all.push(items[i]);",
"    if (!d || !d.has_more || !d.page_token) break;",
"    pageToken = d.page_token;",
"  }",
"  return all;",
"}",
"async function downloadImage(token, fileToken){",
"  var res = await fetch(BASE + '/drive/v1/medias/' + encodeURIComponent(fileToken) + '/download', {",
"    headers: { 'Authorization': 'Bearer ' + token },",
"    signal: AbortSignal.timeout(60000)",
"  });",
"  if (!res.ok) throw new Error('HTTP ' + res.status);",
"  var buf = Buffer.from(await res.arrayBuffer());",
"  var ct = res.headers.get('content-type') || '';",
"  var ext = '.png';",
"  if (ct.indexOf('jpeg') >= 0 || ct.indexOf('jpg') >= 0) ext = '.jpg';",
"  else if (ct.indexOf('gif') >= 0) ext = '.gif';",
"  else if (ct.indexOf('webp') >= 0) ext = '.webp';",
"  return { buf: buf, ext: ext };",
"}",
"async function readDocx(token, docId){",
"  var title = '';",
"  try { var meta = await feishu('/docx/v1/documents/' + encodeURIComponent(docId), token); if (meta && meta.document && meta.document.title) title = meta.document.title; } catch (e) {}",
"  var blocks = await readBlocks(token, docId);",
"  var blockMap = {};",
"  var rootIds = [];",
"  for (var i=0;i<blocks.length;i++){",
"    blockMap[blocks[i].block_id] = blocks[i];",
"    if (blocks[i].parent_id === docId) rootIds.push(blocks[i].block_id);",
"  }",
"  var markdown = title ? ('# ' + title + NL + NL) : '';",
"  markdown += renderDocument(blockMap, rootIds);",
"  cleanupCache(TTL_MS);",
"  var imageTokens = [];",
"  for (var j=0;j<blocks.length;j++){",
"    if (blocks[j].image && blocks[j].image.token && imageTokens.indexOf(blocks[j].image.token) < 0) imageTokens.push(blocks[j].image.token);",
"  }",
"  var images = [];",
"  for (var k=0;k<imageTokens.length && k<CAP_IMAGES;k++){",
"    var tk = imageTokens[k];",
"    var cached = findCached(tk);",
"    if (cached){",
"      images.push({ n: k+1, path: cached });",
"      markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k+1) + '】本地路径：' + cached + NL + NL);",
"    } else {",
"      try {",
"        var dl = await downloadImage(token, tk);",
"        var fn = tk + dl.ext;",
"        var fp = path.join(outDir, fn);",
"        fs.writeFileSync(fp, dl.buf);",
"        images.push({ n: k+1, path: fp });",
"        markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k+1) + '】本地路径：' + fp + NL + NL);",
"      } catch (e) {",
"        markdown = markdown.split('[[IMG:' + tk + ']]').join(NL + NL + '【图片 ' + (k+1) + '】下载失败：' + (e && e.message ? e.message : String(e)) + NL + NL);",
"      }",
"    }",
"  }",
"  if (imageTokens.length > CAP_IMAGES) markdown += NL + '（还有 ' + (imageTokens.length - CAP_IMAGES) + ' 张图片未下载，超过上限）';",
"  return { markdown: markdown, images: images };",
"}",
"async function listWikiChildren(token, spaceId, parentToken){",
"  var d = await feishu('/wiki/v2/spaces/' + encodeURIComponent(spaceId) + '/nodes?parent_node_token=' + encodeURIComponent(parentToken), token);",
"  return (d && d.items) || [];",
"}",
"async function readWiki(token, nodeToken){",
"  var nd = await feishu('/wiki/v2/spaces/get_node?token=' + encodeURIComponent(nodeToken), token);",
"  var node = nd && nd.node;",
"  if (!node) throw new Error('无法解析知识库节点');",
"  var objType = node.obj_type, objToken = node.obj_token, title = node.title || '', spaceId = node.space_id;",
"  if (objType === 'docx' || objType === 'doc'){ var r = await readDocx(token, objToken); return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + r.markdown, images: r.images }; }",
"  if (objType === 'sheet') return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + await readSheets(token, objToken), images: [] };",
"  if (objType === 'bitable') return { markdown: (title ? '> 知识库节点：' + title + NL + NL : '') + await readBitable(token, objToken), images: [] };",
"  var children = await listWikiChildren(token, spaceId, nodeToken);",
"  var out = '# ' + (title || '知识库目录') + NL + NL;",
"  out += '该节点是目录或容器（类型：' + (objType || '未知') + '），无法直接读取正文。子节点如下：' + NL + NL;",
"  for (var i=0;i<children.length;i++){ var c = children[i]; out += '- ' + (c.title || '(无标题)') + '（' + (c.obj_type || '未知') + '）' + NL; }",
"  if (!children.length) out += '(无子节点)' + NL;",
"  return { markdown: out, images: [] };",
"}",
"function valuesToTable(values){",
"  if (!values || !values.length) return '(空表格)';",
"  var rows = values.slice(0, CAP_ROWS).map(function(r){ return (r || []).slice(0, CAP_COLS); });",
"  var headers = rows[0].map(function(c, i){ return (c === null || c === undefined) ? ('列' + (i + 1)) : String(c); });",
"  var body = rows.slice(1).map(function(r){ return r.map(scalar); });",
"  return toTable(headers, body);",
"}",
"async function readSheets(token, tokenStr){",
"  var title = '';",
"  try { var meta = await feishu('/sheets/v3/spreadsheets/' + encodeURIComponent(tokenStr), token); if (meta && meta.spreadsheet && meta.spreadsheet.title) title = meta.spreadsheet.title; } catch (e) {}",
"  var q = await feishu('/sheets/v3/spreadsheets/' + encodeURIComponent(tokenStr) + '/sheets/query', token);",
"  var sheets = (q && q.sheets) || [];",
"  var out = title ? ('# ' + title + NL + NL) : '';",
"  for (var i=0;i<sheets.length;i++){",
"    var sh = sheets[i]; var sid = sh.sheet_id;",
"    out += '## ' + (sh.title || sid) + NL + NL;",
"    try {",
"      var range = sid + '!A1:' + colLetter(CAP_COLS - 1) + String(CAP_ROWS);",
"      var v = await feishu('/sheets/v2/spreadsheets/' + encodeURIComponent(tokenStr) + '/values/' + range, token);",
"      var values = (v && v.valueRange && v.valueRange.values) || [];",
"      out += valuesToTable(values) + NL + NL;",
"    } catch (e) { out += '(读取失败：' + (e && e.message ? e.message : String(e)) + ')' + NL + NL; }",
"  }",
"  return out || '(无工作表)';",
"}",
"async function readBitable(token, appToken){",
"  var title = '';",
"  try { var meta = await feishu('/bitable/v1/apps/' + encodeURIComponent(appToken), token); if (meta && meta.app && meta.app.name) title = meta.app.name; } catch (e) {}",
"  var td = await feishu('/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables', token);",
"  var tables = (td && td.items) || [];",
"  var out = title ? ('# ' + title + NL + NL) : '';",
"  for (var i=0;i<tables.length;i++){ var tb = tables[i]; out += '## ' + (tb.name || tb.table_id) + NL + NL; out += await readBitableTable(token, appToken, tb.table_id) + NL + NL; }",
"  return out || '(无数据表)';",
"}",
"async function readBitableTable(token, appToken, tableId){",
"  var fd = await feishu('/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables/' + encodeURIComponent(tableId) + '/fields', token);",
"  var fields = (fd && fd.items) || [];",
"  var names = fields.map(function(f){ return f.field_name; });",
"  var records = []; var pageToken = null;",
"  while (records.length < CAP_RECORDS){",
"    var path = '/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables/' + encodeURIComponent(tableId) + '/records?page_size=100' + (pageToken ? ('&page_token=' + encodeURIComponent(pageToken)) : '');",
"    var d = await feishu(path, token);",
"    var items = (d && d.items) || [];",
"    for (var i=0;i<items.length && records.length < CAP_RECORDS;i++){ records.push(items[i].fields || {}); }",
"    if (!d || !d.has_more || !d.page_token) break;",
"    pageToken = d.page_token;",
"  }",
"  var seen = {}; var headers = names.slice();",
"  for (var r=0;r<records.length;r++){ for (var k in records[r]){ if (k !== 'record_id' && !seen[k]){ seen[k] = true; headers.push(k); } } }",
"  var rows = records.map(function(rec){ return headers.map(function(h){ return rec[h]; }); });",
"  return toTable(headers, rows);",
"}",
"(async function(){",
"  try {",
"    var token = await getToken(input.appId, input.appSecret);",
"    var link = parseLink(input.url);",
"    var result = null;",
"    if (link.type === 'wiki') result = await readWiki(token, link.token);",
"    else if (link.type === 'sheets') result = { markdown: await readSheets(token, link.token), images: [] };",
"    else if (link.type === 'bitable') result = { markdown: await readBitable(token, link.token), images: [] };",
"    else if (link.type === 'docx') result = await readDocx(token, link.token);",
"    else result = { markdown: '暂不支持该文档类型（' + link.type + '）。当前支持：docx（云文档）、wiki（知识库）、sheets（电子表格）、bitable（多维表格）。', images: [] };",
"    if (result.markdown.length > CAP_CHARS) result.markdown = result.markdown.slice(0, CAP_CHARS) + NL + NL + '…（内容过长，已截断）';",
"    console.log(JSON.stringify({ ok: true, markdown: result.markdown, images: result.images }));",
"  } catch (e) { fail(e && e.message ? e.message : String(e)); }",
"})();"
].join('\n')

export function apply(ctx, config) {
  const credentials = ctx.get('credentials')
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')

  // 设置命名空间 feishu：让「插件配置」卡片可被 dispatch，同时作为凭证的规范存储。
  const feishuSchema = z.object({
    appId: z.string().default(''),
    appSecret: z.string().role('secret').default('')
  })
  try {
    ctx.settings.register('feishu', feishuSchema, {})
  } catch (e) {
    // namespace may already be registered; that is fine.
  }

  async function resolveCreds(args) {
    let appId = (args && typeof args.app_id === 'string' && args.app_id) ? args.app_id : undefined
    let appSecret = (args && typeof args.app_secret === 'string' && args.app_secret) ? args.app_secret : undefined
    let section
    try { section = ctx.settings.get('feishu') } catch (e) {}
    if (!appId && section && section.appId) appId = section.appId
    if (!appSecret && section && section.appSecret) appSecret = section.appSecret
    if (!appId && credentials) {
      const r = await credentials.resolve('FEISHU_APP_ID')
      if (r && r.value) appId = r.value
    }
    if (!appSecret && credentials) {
      const r = await credentials.resolve('FEISHU_APP_SECRET')
      if (r && r.value) appSecret = r.value
    }
    if (!appId || !appSecret) {
      throw new Error('缺少飞书凭证。请在「设置 → 插件 → 插件配置 → 飞书」中保存，或调用 feishu_configure，或在本工具参数中直接传入 app_id / app_secret。')
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
        argv: [nodePath, '-e', script, '--', JSON.stringify(payload)],
        cwd,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 40000000 }, stderr: { maxBytes: 200000 } },
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
    description: '读取飞书文档链接并返回 Markdown，同时把文档内图片下载到本地临时缓存（系统临时目录，24 小时自动清理，按文件 token 缓存避免重复下载）。支持：云文档 docx、知识库 wiki、电子表格 sheets、多维表格 bitable。',
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
    description: '保存飞书自建应用的 App ID 和 App Secret 到设置（feishu 命名空间，settings.yaml），供 feishu_read 使用。',
    parameters: {
      app_id: { type: 'string', required: true, description: '飞书开放平台自建应用的 App ID（通常以 cli_ 开头）' },
      app_secret: { type: 'string', required: true, description: '飞书开放平台自建应用的 App Secret' }
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { saved: { type: 'array', items: { type: 'string' } } } },
      render: (args, value) => [{ type: 'text', text: '已保存飞书凭证：' + value.saved.join(', ') + '。现在可以直接用 feishu_read 读取文档。' }]
    },
    async execute(args) {
      await ctx.settings.update('feishu', { appId: String(args.app_id).trim(), appSecret: String(args.app_secret).trim() })
      return { saved: ['feishu.appId', 'feishu.appSecret'] }
    }
  }))
}
