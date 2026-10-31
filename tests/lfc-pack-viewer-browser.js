#!/usr/bin/env node
// lfc-pack viewer page (modules/lfc-pack/viewer.html) in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Opens made-up files through the page's own code path (single table, several tables, metadata, nested rows, a damaged file, a non-LFC file) and checks what the page shows; checks that the page makes no network request.
// Run: node tests/lfc-pack-viewer-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), JF = require('../modules/lfc-pack/lfc-pack.js');
const dir = path.resolve(__dirname, '../modules/lfc-pack/'), page = fs.readFileSync(dir + '/viewer.html', 'utf8');
T.main(async (b, which, outFile) => {
  await JF.init();
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: i, name: 'n' + i, tag: i % 3 ? null : 'x<b>&"' }));
  const files = {
    plain: [JF.pack(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n')), { rows: 120, shown: 50, cols: 3, meta: false }],
    meta: [JF.pack(Buffer.from('{"a":1}\n{"a":2}\n'), { meta: { title: 'Made-up', producer: 'test' } }), { rows: 2, shown: 2, cols: 1, meta: true }],
    tables: [JF.packTables({ people: [{ id: 1 }, { id: 2 }], cfg: { v: [1, 2] } }), { tables: 2 }],
    nested: [JF.pack(Buffer.from('{"p":{"q":[1,{"r":"s"}]}}\n[1,2]\n"x"\n'), { block: 'nested' }), { rows: 3, shown: 3 }],
    damaged: [Buffer.concat([JF.pack(Buffer.from('{"a":1}\n')).subarray(0, 40)]), { error: true }],
    big: [JF.pack(Buffer.from(Array.from({ length: 200000 }, (_, i) => JSON.stringify({ id: i, ts: 1760000000 + i * 3, level: ['INFO', 'WARN', 'ERROR'][i % 3], ms: (i * 7919 % 5000) / 100, msg: 'GET /item/' + (i % 977) + ' ok' })).join('\n') + '\n')), { rows: 200000, shown: 50, cols: 5 }],
    notlfc: [Buffer.from('hello world, this is not a packed file at all'), { error: true }]
  };
  const srv = await T.serve({ '/viewer.html': page });
  const p = await b.newPage(), reqs = []; p.on('request', (r) => reqs.push(r.url()));
  await p.goto(srv.base + '/viewer.html'); await T.sleep(500);
  let bad = [];
  for (const [name, [bytes, want]] of Object.entries(files)) {
    const got = await p.evaluate(async (n, b64) => {
      const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); window.lfcViewer.open(n + '.json.lfc', u);
      for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 30)); if (document.getElementById('err').textContent || !document.getElementById('out').hidden) { await new Promise((r) => setTimeout(r, 30)); break; } }
      const cards = [...document.querySelectorAll('#cards .card')].map((c) => c.textContent);
      return { err: document.getElementById('err').textContent, hidden: document.getElementById('out').hidden, cards, shown: document.getElementById('shown').textContent, trs: document.querySelectorAll('#tbl tbody tr').length, ths: document.querySelectorAll('#tbl th').length, meta: document.getElementById('meta').textContent, tabs: document.querySelectorAll('#tabs button').length, html: document.getElementById('tbl').innerHTML };
    }, name, Buffer.from(bytes).toString('base64'));
    const ok = want.error ? !!got.err && got.hidden : !got.err && !got.hidden && (want.rows === undefined || got.cards.some((c) => c.replace(/[^0-9a-zA-Z]/g, '').includes('Rows' + want.rows))) && (want.shown === undefined || got.trs === want.shown) && (want.cols === undefined || got.ths === want.cols) && (want.meta === undefined || (want.meta ? got.meta.includes('Made-up') : got.meta.includes('no metadata'))) && (want.tables === undefined || got.tabs === want.tables);
    if (name === 'plain' && /<b>/.test(got.html)) bad.push('plain: html not escaped');
    if (name === 'big') console.log('big file: ' + got.cards.filter((c) => /Size|Opened/.test(c)).join(', '));
    console.log((ok ? 'ok   ' : 'FAIL ') + name + (got.err ? ' (' + got.err.slice(0, 70) + ')' : ' rows shown ' + got.trs + ', ' + got.shown)); if (!ok) bad.push(name);
  }
  const net = reqs.filter((u) => !u.startsWith(srv.base) && !u.startsWith('data:') && !u.startsWith('blob:')); if (net.length) bad.push('network: ' + net[0]);
  console.log('requests outside the page: ' + net.length); await p.close().catch(() => {}); srv.close();
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ bad }));
  return !bad.length;
});
