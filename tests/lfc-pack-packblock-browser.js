#!/usr/bin/env node
// packStream with the text pushed on the main thread, against packBlock() in 1 or 2 Web Workers with pushPacked() appending in order (lfc-pack 0.7.0). Every pass checks the file is the same bytes. ms per pass, median, smaller is better. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-packblock-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=5, ROWS=400000, BB=2097152
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), REPS = +process.env.REPS || 5, ROWS = +process.env.ROWS || 400000, BB = +process.env.BB || 2097152;
const SRC = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8');
const PAGE = `
var J, text, chunks = [], want, ws = [], O = { blockBytes: ${BB} };
function same(parts) { var n = 0, i, j, p = 0; for (i = 0; i < parts.length; i++) n += parts[i].length; if (n !== want.length) return false; for (i = 0; i < parts.length; i++) { var a = parts[i]; for (j = 0; j < a.length; j++) if (a[j] !== want[p++]) return false; } return true; }
async function setup() {
  J = window.LfcPack; await J.init(); var L = [], i;
  for (i = 0; i < ${ROWS}; i++) L.push(JSON.stringify({ id: i * 7 % 1000003, name: 'name' + (i % 5000), date: '2024-' + String(1 + i % 12).padStart(2, '0') + '-' + String(1 + i % 28).padStart(2, '0'), note: 'n' + (i % 977) + ' x', score: ((i * 37) % 10000 / 100).toFixed(2) }));
  text = new TextEncoder().encode(L.join('\\n') + '\\n');
  for (var o = 0; o < text.length;) { var e = text.length; if (text.length - o > O.blockBytes) { var nl = text.indexOf(10, o + O.blockBytes); if (nl >= 0) e = nl + 1; } chunks.push(text.subarray(o, e)); o = e; }
  var s = J.packStream(O), parts = s.push(text).concat(s.finish()), n = 0; parts.forEach(function (p) { n += p.length; }); want = new Uint8Array(n); n = 0; parts.forEach(function (p) { want.set(p, n); n += p.length; });
  var url = URL.createObjectURL(new Blob(["importScripts('" + location.origin + "/l.js'); var ready = LfcPack.init(); onmessage = function (m) { ready.then(function () { var r = LfcPack.packBlock(m.data.c, m.data.o); postMessage({ i: m.data.i, r: r }, [r.buffer]); }); };"]));
  for (i = 0; i < 2; i++) ws.push(new Worker(url));
  await Promise.all(ws.map(function (w) { return new Promise(function (res) { w.onmessage = res; var c = new Uint8Array(text.subarray(0, 4096)); w.postMessage({ i: 0, c: c.slice(0, c.lastIndexOf(10) + 1), o: O }); }); }));
  return { mb: text.length / 1e6, chunks: chunks.length };
}
function job(name) {
  var t = performance.now();
  if (name === 'push on main thread') { var s = J.packStream(O), parts = s.push(text).concat(s.finish()); if (!same(parts)) throw new Error('bytes differ'); return Promise.resolve(performance.now() - t); }
  var W = name.indexOf('2') >= 0 ? 2 : 1;
  return new Promise(function (res, rej) {
    var got = [], st = J.packStream(O), parts = [], next = 0, emit = 0;
    function go(w) { if (next >= chunks.length) return; var i = next++; w.postMessage({ i: i, c: new Uint8Array(chunks[i]), o: O }); }
    ws.slice(0, W).forEach(function (w) { w.onmessage = function (m) { got[m.data.i] = m.data.r; while (got[emit]) { parts.push.apply(parts, st.pushPacked(got[emit])); got[emit++] = null; } go(w);
      if (emit === chunks.length) { parts.push.apply(parts, st.finish()); var ms = performance.now() - t; if (!same(parts)) rej(new Error('bytes differ')); else res(ms); } }; go(w); });
  });
}`;
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/p.html': '<!doctype html><meta charset=utf-8><script>' + SRC + '</script><script>' + PAGE + '</script>', '/l.js': SRC });
  const p = await b.newPage(); await p.goto(srv.base + '/p.html'); const s = await p.evaluate('setup()');
  const jobs = ['push on main thread', 'packBlock, 1 worker', 'packBlock, 2 workers'];
  const r = await T.rotate(jobs, REPS, (n) => p.evaluate((x) => job(x), n));
  console.log(which + ', ' + s.mb.toFixed(0) + ' MB in ' + s.chunks + ' chunks, ms per pass (median of ' + REPS + '; smaller is better; every pass checked byte for byte)');
  console.log(T.table(jobs.map((n) => ({ n, ms: r[n].toFixed(0), x: (r[n] / r[jobs[0]]).toFixed(2) })), [{ key: 'n', title: 'Pack', align: 'left' }, { key: 'ms', title: 'ms' }, { key: 'x', title: 'x push' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: which, reps: REPS, results: r }, null, 1));
  await p.close().catch(() => {}); srv.close();
});
