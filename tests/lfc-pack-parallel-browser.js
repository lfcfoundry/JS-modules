#!/usr/bin/env node
// lfc-pack block-parallel pack in one real browser at a time: packParallel writes the same bytes as pack (real Web Workers, small blocks so several helpers get runs); timings are unguarded and only a smoke check. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-parallel-browser.js <chromium|firefox|webkit>
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8');
async function pageWork() {
  const J = window.LfcPack; await J.init(); const out = { bad: [], rows: [] };
  const rows = []; for (let i = 0; i < 80000; i++) rows.push(JSON.stringify({ id: i, name: 'n' + (i % 977), v: i * 1.5, t: i % 2 ? 'a' : 'b', o: { x: i % 7 } }));
  const full = new TextEncoder().encode(rows.join('\n') + '\n'), notail = new TextEncoder().encode(rows.slice(0, 5000).join('\n'));
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  for (const [name, data, bb] of [['rows', full, 300000], ['no trailing newline', notail, 50000]]) for (const w of [2, 3, 8]) {
    const a = J.pack(data, { blockBytes: bb }); let t = performance.now(); const b = await J.packParallel(data, { blockBytes: bb, workers: w }); t = performance.now() - t;
    if (!eq(a, b)) out.bad.push(name + ' x' + w + ': bytes differ'); else if (J.unpack(b).length !== J.info(a).rows) out.bad.push(name + ' x' + w + ': rows');
    out.rows.push(name + ' workers ' + w + ': ' + b.length + ' bytes, ' + J.info(b).blocks + ' blocks, ' + t.toFixed(0) + ' ms (unguarded)');
  }
  let err = null; try { await J.packParallel(new TextEncoder().encode('{"a":1}\nnotjson\n'.repeat(20000)), { blockBytes: 100000, workers: 3 }); } catch (e) { err = e; } if (!err) out.bad.push('bad input must reject');
  const ex = await J.packParallel(full, { exact: true, blockBytes: 300000 }); if (!eq(ex, J.pack(full, { exact: true, blockBytes: 300000 }))) out.bad.push('exact falls back to one thread');
  return out;
}
T.main(async (b) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html'); let r; try { r = await p.evaluate('(' + pageWork.toString() + ')()'); } finally { await p.close().catch(() => {}); srv.close(); }
  r.rows.forEach((l) => console.log(l));
  if (r.bad.length) { console.log('FAIL ' + r.bad.join('; ')); return false; }
  console.log('block-parallel pack matches single-thread bytes'); return true;
});
