import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLink, toTable, textContent, styledText, cellText, renderTable, scalar } from './script.js'

test('parseLink: docx', () => {
  assert.deepEqual(parseLink('https://x.feishu.cn/docx/AbCdEf?from=x'), { type: 'docx', token: 'AbCdEf' })
})

test('parseLink: wiki with query', () => {
  assert.deepEqual(parseLink('https://my.feishu.cn/wiki/GAUAweAm5iCGKEkYFJnc5aDcnOf?from=from_copylink'), { type: 'wiki', token: 'GAUAweAm5iCGKEkYFJnc5aDcnOf' })
})

test('parseLink: sheets / base', () => {
  assert.deepEqual(parseLink('https://x.feishu.cn/sheets/ShtAbC'), { type: 'sheets', token: 'ShtAbC' })
  assert.deepEqual(parseLink('https://x.feishu.cn/base/BascnAbC'), { type: 'bitable', token: 'BascnAbC' })
  assert.deepEqual(parseLink('https://x.feishu.cn/bitable/BascnAbC'), { type: 'bitable', token: 'BascnAbC' })
})

test('parseLink: bare token', () => {
  assert.deepEqual(parseLink('doxcnAbCdEf12345'), { type: 'docx', token: 'doxcnAbCdEf12345' })
})

test('parseLink: invalid throws', () => {
  assert.throws(() => parseLink('https://example.com/foo'))
})

test('styledText: bold / code / link / combo', () => {
  assert.equal(styledText('a', { bold: true }), '**a**')
  assert.equal(styledText('a', { inline_code: true }), '`a`')
  assert.equal(styledText('a', { link: { url: 'https://x' } }), '[a](https://x)')
  assert.equal(styledText('a', { bold: true, link: { url: 'https://x' } }), '[**a**](https://x)')
  assert.equal(styledText('a', undefined), 'a')
})

test('textContent: joins runs with styles', () => {
  const t = { elements: [
    { text_run: { content: 'hello ', text_element_style: { bold: true } } },
    { text_run: { content: 'world' } }
  ] }
  assert.equal(textContent(t), '**hello **world')
})

test('toTable: escapes pipes and newlines', () => {
  const table = toTable(['a', 'b'], [['x|y', 'z\nw']])
  assert.ok(table.includes('| a | b |'))
  assert.ok(table.includes('x&#124;y'))
  assert.ok(table.includes('z<br>w'))
})

test('cellText: text + image placeholder', () => {
  const blockMap = {
    cell1: { children: ['t1', 'img1'] },
    t1: { block_type: 2, text: { elements: [{ text_run: { content: '内容' } }] } },
    img1: { block_type: 27, image: { token: 'tok1' } }
  }
  assert.equal(cellText(blockMap, 'cell1'), '内容<br>[[CELLIMG:tok1]]')
})

test('renderTable: grid with header row', () => {
  const blockMap = {}
  const mk = (id, text) => {
    blockMap[id] = { children: ['t_' + id] }
    blockMap['t_' + id] = { block_type: 2, text: { elements: [{ text_run: { content: text } }] } }
  }
  mk('c0', 'h1'); mk('c1', 'h2'); mk('c2', 'h3')
  mk('c3', 'a'); mk('c4', 'b'); mk('c5', 'c')
  const tableBlock = {
    block_type: 31,
    table: {
      property: { row_size: 2, column_size: 3, header_row: true },
      cells: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']
    }
  }
  const out = renderTable(blockMap, tableBlock)
  assert.ok(out.includes('| h1 | h2 | h3 |'))
  assert.ok(out.includes('| a | b | c |'))
})

test('renderTable: merged cells repeat content (no info loss)', () => {
  const blockMap = {}
  const mk = (id, text) => {
    blockMap[id] = { children: ['t_' + id] }
    blockMap['t_' + id] = { block_type: 2, text: { elements: [{ text_run: { content: text } }] } }
  }
  mk('m0', '合并内容'); mk('m1', ''); mk('m2', 'x'); mk('m3', 'y')
  const tableBlock = {
    block_type: 31,
    table: {
      property: {
        row_size: 2, column_size: 2, header_row: false,
        merge_info: [
          { col_span: 2, row_span: 1 }, { col_span: 0, row_span: 1 },
          { col_span: 1, row_span: 1 }, { col_span: 1, row_span: 1 }
        ]
      },
      cells: ['m0', 'm1', 'm2', 'm3']
    }
  }
  const out = renderTable(blockMap, tableBlock)
  const lines = out.split(String.fromCharCode(10))
  assert.ok(lines[2].includes('合并内容 | 合并内容'), 'merged content should repeat: ' + lines[2])
})

test('scalar: null/array/object', () => {
  assert.equal(scalar(null), '')
  assert.equal(scalar('a'), 'a')
  assert.equal(scalar([1, 2]), '1, 2')
  assert.equal(scalar({ a: 1 }), '{"a":1}')
})
