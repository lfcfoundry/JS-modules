#!/usr/bin/env node
// gpu-blur helpers route (opt-in, background workers): same bytes as the one-thread wasm kernel for prime sizes, radius 0 to 100 and bands thinner than the blur's reach,
// from bytes (against one-thread wasm pixels) and from a canvas into a canvas (against one-thread wasm canvas); falls back to one-thread wasm under a page policy without worker-src blob:; then the time against one-thread wasm.
// Run: node tests/gpu-blur-helpers-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 7)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 7);
const page = '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gb.js': fs.readFileSync(root + 'gpu-blur/gpu-blur.js', 'utf8'), '/page.html': page,
    '/strict.html': { body: page, headers: { 'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'none'" } } });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => GpuBlur.ready());
  const cores = await p.evaluate(() => navigator.hardwareConcurrency); console.log('cores reported: ' + cores);
  const same = await p.evaluate(async () => {
    let s = 5; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24, out = { cases: 0, bad: [], routes: {} };
    const eq = (a, c) => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
    for (const [w, h] of [[31, 7], [97, 13], [211, 101], [641, 359], [1009, 23]]) for (const r of [0, 1, 12, 100]) for (const n of [2, 3, 7]) {
      const px = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < px.length; i++) px[i] = rnd();
      const ref = GpuBlur.blurSync(px, w, h, r, { out: 'pixels', route: 'wasm' }).pixels;
      const a = await GpuBlur.blur(px, w, h, r, { out: 'pixels', workers: n, helperMinPixels: 0 });
      out.routes[a.route] = (out.routes[a.route] || 0) + 1; out.cases++;
      if (!eq(a.pixels, ref)) out.bad.push(w + 'x' + h + ' r' + r + ' n' + n + ' bytes->pixels');
      if (r === 12 || r === 100) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(px.slice(), w, h), 0, 0);
        const one = await GpuBlur.blur(c, w, h, r, { out: 'canvas', route: 'wasm' }), ref2 = one.canvas.getContext('2d').getImageData(0, 0, w, h).data;   // the same canvas trip (alpha is kept premultiplied there) through the one-thread route
        const d = await GpuBlur.blur(c, w, h, r, { out: 'canvas', workers: n, helperMinPixels: 0 });
        out.cases++; if (d.route !== 'helpers' || !eq(d.canvas.getContext('2d').getImageData(0, 0, w, h).data, ref2)) out.bad.push(w + 'x' + h + ' r' + r + ' n' + n + ' canvas->canvas (' + d.route + ')');
      }
    }
    const small = await GpuBlur.blur(new Uint8ClampedArray(100 * 100 * 4), 100, 100, 5, { out: 'pixels', route: 'helpers' }); out.smallRoute = small.route;
    GpuBlur.release(); return out;
  });
  console.log('same bytes: ' + same.cases + ' cases, routes ' + JSON.stringify(same.routes) + ', differ: ' + (same.bad.length ? same.bad.slice(0, 5).join('; ') : 'none') + '; a 100x100 picture with route helpers ran on ' + same.smallRoute);
  const p2 = await b.newPage(); await p2.goto(srv.base + '/strict.html');
  const strict = await p2.evaluate(async () => { await GpuBlur.ready(); const px = new Uint8ClampedArray(800 * 600 * 4).fill(90); const r = await GpuBlur.blur(px, 800, 600, 12, { out: 'pixels', workers: 3 }); return r.route; });
  console.log('page policy without worker-src blob: ran on ' + strict + ' (wanted wasm)');
  await p2.close();
  const rows = [];
  for (const [w, h] of [[1280, 720], [1920, 1080], [3840, 2160]]) for (const r of [4, 12, 40]) {
    await p.evaluate((w, h) => { let s = 1; window.PX = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < PX.length; i++) PX[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24; }, w, h);
    const names = ['wasm, one thread', 'helpers, cores - 1'];
    const ms = await T.rotate(names, REPS, (k) => p.evaluate(async (k, w, h, r) => { const t = performance.now(); await GpuBlur.blur(PX, w, h, r, k[0] === 'w' ? { out: 'pixels', route: 'wasm' } : { out: 'pixels', route: 'helpers' }); return performance.now() - t; }, k, w, h, r));
    rows.push({ size: w + 'x' + h, r, wasm: +ms[names[0]].toFixed(1), helpers: +ms[names[1]].toFixed(1), ratio: (ms[names[1]] / ms[names[0]]).toFixed(2) });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'size', title: 'picture', align: 'left' }, { key: 'r', title: 'radius' }, { key: 'wasm', title: 'wasm ms' }, { key: 'helpers', title: 'helpers ms' }, { key: 'ratio', title: 'helpers / wasm (lower is better)' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, cores, same, strict, rows }));
  return same.bad.length === 0 && same.smallRoute === 'wasm' && strict === 'wasm' && (same.routes.helpers || 0) > 0;
});
