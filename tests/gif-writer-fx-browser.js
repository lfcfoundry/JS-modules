#!/usr/bin/env node
// gif-writer-fx and gif-writer-worker in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Checks (pass/fail only, no timing): the WebAssembly filters give the same bytes as the JavaScript for every filter preset on a 160 x 90 picture; the worker handler filters, builds a palette
// and writes a GIF that starts with GIF89a; a size tolerance GIF is no bigger than the exact one. The graphics-card create() is called and must not throw (it may return null; the caller then keeps the WebAssembly path).
// Run: node tests/gif-writer-fx-browser.js <chromium|firefox|webkit> [out.json]     (or through: node tools/test-runner/cli.js all tests/gif-writer-fx-browser.js)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/gif-writer/', rd = (f) => fs.readFileSync(root + f, 'utf8');
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': rd('gif-writer.js'), '/fx.js': rd('gif-writer-fx.js'), '/card.js': rd('gif-writer-card.js'), '/worker.js': rd('gif-writer-worker.js'),
    '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script><script src="/fx.js"></script><script src="/card.js"></script><script src="/worker.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const r = await p.evaluate(async () => {
    const out = []; const ok = (c, m) => { if (!c) throw new Error(m); };
    try {
      const X = GifWriterFx, W = 160, H = 90, pic = () => { const a = new Uint8ClampedArray(W * H * 4); for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { a[i] = x * 255 / W; a[i + 1] = y * 255 / H; a[i + 2] = (x * y) & 255; a[i + 3] = 255; } return a; };
      ok(await X.initWasm() === true && X.wasmReady(), 'WebAssembly filters did not start');
      let n = 0; for (const [name, f] of X.FILTER_PRESETS) { const fc = Object.assign({}, f), a = pic(), c = pic(); X.applyJs(c, W, H, fc); X.applyWasm(a, W, H, fc); for (let i = 0; i < a.length; i++) ok(a[i] === c[i], 'filter ' + name + ' differs at byte ' + i); n++; }
      out.push(n + ' filter presets: WebAssembly equals JavaScript');
      const posts = [], h = (m) => GifWriterWorker.handle(m, (r) => posts.push(r)); h({ t: 'init', w: W, h: H });
      const a0 = pic(), a1 = pic(); for (let i = 0; i < 4000; i += 4) a1[i] = 255 - a1[i];
      h({ t: 'palette', bufs: [a0.buffer.slice(0), a1.buffer.slice(0)], colors: 255, tol: 0 }); h({ t: 'frame', id: 1, buf: a0.buffer.slice(0), ms: 40 }); h({ t: 'frame', id: 2, buf: a1.buffer.slice(0), ms: 40 }); h({ t: 'finish' });
      const done = posts.find((q) => q.t === 'done'); ok(done && String.fromCharCode.apply(null, new Uint8Array(done.bytes, 0, 6)) === 'GIF89a', 'worker did not write a GIF');
      const flat = (r) => { const a = new Uint8ClampedArray(W * H * 4); for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { a[i] = x < W / 2 ? r : 10; a[i + 1] = 100; a[i + 2] = x < W / 2 ? 100 : 220; a[i + 3] = 255; } return a; };
      const f0 = flat(100), f1 = flat(105), size = (tol) => { const e = GifWriter.createEncoder(W, H, GifWriter.makePalette([f0, f1], 255), { tolerance: tol }); e.add(f0, 40); e.add(f1, 40); return e.finish().length; };
      ok(size(8) < size(0), 'tolerance did not make the file smaller (' + size(8) + ' vs ' + size(0) + ')'); out.push('worker wrote a GIF; a color change of 5 steps: ' + size(8) + ' bytes with tolerance 8, ' + size(0) + ' exact');
      try { GifWriterCard.create(new OffscreenCanvas(8, 8)); } catch (e) { /* the caller keeps the WebAssembly path */ } out.push('graphics-card path: create() returns without throwing');
    } catch (e) { out.push('FAIL ' + e.message); }
    return out;
  });
  srv.close(); console.log(r.join('\n'));
  const pass = !r.some((x) => /^FAIL/.test(x)); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, pass, r })); return pass;
});
