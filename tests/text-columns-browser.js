#!/usr/bin/env node
// text-columns in one real browser at a time: wasm and plain paths agree with Number() and a hand split, then timings against a hand split, behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/text-columns-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=7, ROWS=200000, BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/text-columns/text-columns.js'), 'utf8');
const REPS = +process.env.REPS || 7, ROWS = +process.env.ROWS || 200000;
async function pageWork(reps, rows) {
  const TC = window.TextColumns; await TC.ready();
  let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const out = { bad: [], times: {}, simd: TC.simd() }, lines = ['id,price,qty,city,note,code'];
  for (let i = 0; i < rows; i++) lines.push([i, (r() * 1000 - 300).toFixed(2), Math.floor(r() * 99), 'city' + Math.floor(r() * 500), r() < 0.1 ? '"say ""hi"", ok"' : 'note ' + Math.floor(r() * 1e5), '0' + Math.floor(r() * 99)].join(','));
  const bytes = new TextEncoder().encode(lines.join('\n') + '\n'), med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const a = TC.parse(bytes), b = TC.parse(bytes, { plain: true });
  if (a.count !== rows || b.count !== rows) out.bad.push('row count');
  for (let c = 0; c < 6; c++) { if (a.columns[c].type !== b.columns[c].type) { out.bad.push('type col ' + c); continue; } const x = a.columns[c].values, y = b.columns[c].values; for (let i = 0; i < rows; i++) if (x[i] !== y[i]) { out.bad.push('col ' + c + ' row ' + i); break; } }
  const types = a.columns.map((c) => c.type).join(); if (types !== 'number,number,number,text,text,text') out.bad.push('types ' + types);
  const naive = () => { const ls = new TextDecoder().decode(bytes).split('\n'); ls.pop(); const rr = ls.slice(1).map((l) => l.split(',')); return rr.map((x) => +x[1]); };
  const tw = [], tp = [], tn = [];
  for (let k = 0; k < reps; k++) {
    let t = performance.now(); TC.parse(bytes); tw.push(performance.now() - t);
    t = performance.now(); TC.parse(bytes, { plain: true }); tp.push(performance.now() - t);
    t = performance.now(); naive(); tn.push(performance.now() - t);
  }
  out.times = { wasm: med(tw), plain: med(tp), naive: med(tn) };
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ',' + ROWS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result, t = r.times;
  console.log('SIMD ' + r.simd + '; wasm ' + t.wasm.toFixed(0) + ' ms, plain JS ' + t.plain.toFixed(0) + ' ms, hand split ' + t.naive.toFixed(0) + ' ms (hand split makes one number column only)');
  if (r.bad.length) { console.log('FAIL ' + r.bad.slice(0, 10).join('; ')); return false; }
  console.log('wasm and plain paths agree'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(r, null, 1)); return true;
});
