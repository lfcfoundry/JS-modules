#!/usr/bin/env node
// gif-writer old against new in one real browser at a time, behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// The default write path (WebAssembly) and the JavaScript path (wasm:false), a noisy photo-like scene and a flat moving-block scene, 10 pictures of 640 x 480: palette search + encode, old and new taking turns inside one page.
// Run: git show origin/main:modules/gif-writer/gif-writer.js > /tmp/gw-old.js; OLD=/tmp/gw-old.js node tests/gif-writer-speed-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=5
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const newSrc = fs.readFileSync(path.resolve(__dirname, '../modules/gif-writer/gif-writer.js'), 'utf8'), REPS = +process.env.REPS || 5;
if (!process.env.OLD) { console.log('set OLD=path to the old gif-writer.js'); process.exit(2); }
const oldSrc = fs.readFileSync(process.env.OLD, 'utf8').replace(/GifWriter\b/g, 'GifWriterOld');
function pageWork(reps) {
  const W = 640, H = 480, N = 10; let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const photo = [], flat = [];
  for (let k = 0; k < N; k++) {
    const a = new Uint8ClampedArray(W * H * 4), f = new Uint8ClampedArray(W * H * 4);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
      a[i] = (x * 255 / W + k * 3 + (r() * 12 | 0)) & 255; a[i + 1] = (y * 255 / H + (r() * 12 | 0)) & 255; a[i + 2] = ((x ^ y) + k) & 255; a[i + 3] = 255;
      const inBlock = x > 40 + k * 15 && x < 120 + k * 15 && y > 200 && y < 260;
      f[i] = inBlock ? 220 : 30; f[i + 1] = inBlock ? 60 : 30; f[i + 2] = inBlock ? 60 : 90; f[i + 3] = 255;
    }
    photo.push(a); flat.push(f);
  }
  const run = (G, pics, wasm) => { const pal = G.makePalette(pics.slice(0, 4), 255, { wasm }), e = G.createEncoder(W, H, pal, { wasm, loop: true }); for (const p of pics) e.add(p, 40); return e.finish().length; };
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const out = { bad: [], rows: [] };
  for (const [sn, pics, inner] of [['photo', photo, 1], ['flat block', flat, 20]]) for (const wasm of [true, false]) {   // the flat scene is quick, so each sample repeats it
    const o = run(GifWriterOld, pics, wasm), n = run(GifWriter, pics, wasm); if (o !== n) out.bad.push(sn + ' wasm=' + wasm + ': ' + o + ' vs ' + n + ' bytes');
    const t = { old: [], new: [] };
    for (let k = 0; k < reps + 1; k++) for (const w of (k % 2 ? ['new', 'old'] : ['old', 'new'])) { const t0 = performance.now(); for (let q = 0; q < inner; q++) run(w === 'old' ? GifWriterOld : GifWriter, pics, wasm); if (k) t[w].push((performance.now() - t0) / inner); }
    out.rows.push({ name: sn + (wasm ? ', default path (WebAssembly)' : ', JavaScript path'), before: med(t.old), after: med(t.new), bytes: n });
  }
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + oldSrc + '</script><script>' + newSrc + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = await T.guarded(b, which, run); srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const rows = T.speedGuard(g.result.rows); console.log('noise guard tries ' + g.tries);
  console.log(T.table(rows.map((r) => ({ name: r.name, before: r.before.toFixed(1), after: r.after.toFixed(1), x: r.ratio.toFixed(3), v: r.verdict })), [{ key: 'name', title: 'case', align: 'left' }, { key: 'before', title: 'old ms' }, { key: 'after', title: 'new ms' }, { key: 'x', title: 'old/new' }, { key: 'v', title: 'speed guard', align: 'left' }]));
  if (g.result.bad.length) console.log('DIFFERENT SIZES: ' + g.result.bad.join('; '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows, calibrations: g.calibrations }));
  return !g.result.bad.length && !rows.some((r) => r.slower);
});
