#!/usr/bin/env node
// gpu-blur threads route (opt-in, WebAssembly threads on one shared memory): same bytes as the one-thread wasm kernel for prime sizes, radius 0 to 100 and 2, 3 or 7 threads,
// from bytes and from a canvas into a canvas, on a cross-origin isolated page; on a page without isolation it gives way to the helpers route; then the time of
// 1.0.0's one-thread wasm (the old 32-bit kernel), one-thread wasm, helpers and threads, each alone in rotation. A browser that cannot hand shared memory to a worker
// (WebKitGTK 2.52) must give way to the helpers route with the same bytes; it gets no threads timing.
// Run: node tests/gpu-blur-threads-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 7), OLD (path to gpu-blur 1.0.0, optional)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 7);
const ISO = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
const page = (...src) => '<!doctype html><meta charset=utf-8><title>t</title>' + src.map((x) => '<script src="' + x + '"></script>').join('');   // one page at a time (the WebKitGTK driver has one)
T.main(async (b, which, outFile) => {
  const routes = { '/gb.js': { body: fs.readFileSync(root + 'gpu-blur/gpu-blur.js', 'utf8'), type: 'text/javascript', headers: ISO },
    '/iso.html': { body: page('/gb.js'), headers: ISO }, '/plain.html': page('/gb.js') };
  const OLD = !!process.env.OLD;   // 1.0.0 loads beside the new one as GpuBlurOld
  if (OLD) { routes['/old.js'] = { body: fs.readFileSync(process.env.OLD, 'utf8').replace('root.GpuBlur = factory(root)', 'root.GpuBlurOld = factory(root)'), type: 'text/javascript', headers: ISO }; routes['/timing.html'] = { body: page('/gb.js', '/old.js'), headers: ISO }; }
  const srv = await T.serve(routes);
  const p = await b.newPage(); await p.goto(srv.base + '/iso.html');
  const inf = await p.evaluate(async () => { await GpuBlur.ready(); return { iso: self.crossOriginIsolated, threads: GpuBlur.info().threads, cores: navigator.hardwareConcurrency }; });
  console.log('cross-origin isolated: ' + inf.iso + ', info().threads: ' + inf.threads + ', cores reported: ' + inf.cores);
  const same = await p.evaluate(async () => {
    let s = 5; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24, out = { cases: 0, bad: [], routes: {} };
    let want = null; const eq = (a, c) => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
    for (const [w, h] of [[31, 7], [97, 13], [211, 101], [641, 359], [1009, 23]]) for (const r of [0, 1, 12, 100]) for (const n of [2, 3, 7]) {
      const px = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < px.length; i++) px[i] = rnd();
      const ref = GpuBlur.blurSync(px, w, h, r, { out: 'pixels', route: 'wasm' }).pixels;
      const a = await GpuBlur.blur(px, w, h, r, { out: 'pixels', route: 'threads', workers: n, helperMinPixels: 0 });
      if (!want) want = out.want = a.route === 'threads' ? 'threads' : 'helpers';
      out.routes[a.route] = (out.routes[a.route] || 0) + 1; out.cases++;
      if (a.route !== want || !eq(a.pixels, ref)) out.bad.push(w + 'x' + h + ' r' + r + ' n' + n + ' bytes->pixels (' + a.route + ')');
      if (r === 12 || r === 100) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(px.slice(), w, h), 0, 0);
        const one = await GpuBlur.blur(c, w, h, r, { out: 'canvas', route: 'wasm' }), ref2 = one.canvas.getContext('2d').getImageData(0, 0, w, h).data;
        const d = await GpuBlur.blur(c, w, h, r, { out: 'canvas', route: 'threads', workers: n, helperMinPixels: 0 });
        out.cases++; if (d.route !== want || !eq(d.canvas.getContext('2d').getImageData(0, 0, w, h).data, ref2)) out.bad.push(w + 'x' + h + ' r' + r + ' n' + n + ' canvas->canvas (' + d.route + ')');
      }
    }
    // two jobs at once take turns on the one memory
    const w = 640, h = 480, x = new Uint8ClampedArray(w * h * 4), y = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < x.length; i++) { x[i] = rnd(); y[i] = rnd(); }
    const [ra, rb] = await Promise.all([GpuBlur.blur(x, w, h, 9, { out: 'pixels', route: 'threads' }), GpuBlur.blur(y, w, h, 40, { out: 'pixels', route: 'threads' })]);
    out.cases++; if (!eq(ra.pixels, GpuBlur.blurSync(x, w, h, 9, { out: 'pixels', route: 'wasm' }).pixels) || !eq(rb.pixels, GpuBlur.blurSync(y, w, h, 40, { out: 'pixels', route: 'wasm' }).pixels)) out.bad.push('two jobs at once');
    const small = await GpuBlur.blur(new Uint8ClampedArray(100 * 100 * 4), 100, 100, 5, { out: 'pixels', route: 'threads' }); out.smallRoute = small.route;
    return out;
  });
  console.log('same bytes: ' + same.cases + ' cases, routes ' + JSON.stringify(same.routes) + ', differ: ' + (same.bad.length ? same.bad.slice(0, 5).join('; ') : 'none') + '; a 100x100 picture with route threads ran on ' + same.smallRoute);
  const p2 = await b.newPage(); await p2.goto(srv.base + '/plain.html');
  const plain = await p2.evaluate(async () => { await GpuBlur.ready(); const px = new Uint8ClampedArray(800 * 600 * 4).fill(90); const r = await GpuBlur.blur(px, 800, 600, 12, { out: 'pixels', route: 'threads' }); return { route: r.route, threads: GpuBlur.info().threads }; });
  console.log('page without isolation: ran on ' + plain.route + ' (wanted helpers), info().threads ' + plain.threads);
  await p2.close();
  await p.goto(srv.base + (OLD ? '/timing.html' : '/iso.html')); await p.evaluate((o) => Promise.all([GpuBlur.ready(), o && GpuBlurOld.ready()]), OLD); const po = OLD;
  const rows = [], fill = (w, h) => { let s = 1; window.PX = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < PX.length; i++) PX[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24; };
  for (const [w, h] of [[1280, 720], [1920, 1080], [3840, 2160]]) for (const r of [4, 12, 40]) {
    await p.evaluate(fill, w, h);
    const names = (po ? ['1.0.0 wasm'] : []).concat(['wasm', 'helpers'], same.want === 'threads' ? ['threads'] : []);
    const ms = await T.rotate(names, REPS, (k) => p.evaluate(async (k, w, h, r) => { const route = k === '1.0.0 wasm' ? 'wasm' : k, G = k === '1.0.0 wasm' ? GpuBlurOld : GpuBlur; const t = performance.now(); const x = await G.blur(PX, w, h, r, { out: 'pixels', route }); if (x.route !== route) throw new Error(k + ' ran on ' + x.route); return performance.now() - t; }, k, w, h, r));
    const row = { size: w + 'x' + h, r }; for (const k of names) row[k] = +ms[k].toFixed(1);
    const best = ms.threads || ms.helpers; if (ms.threads) { row.th = (ms.threads / ms.helpers).toFixed(2); row.tw = (ms.threads / ms.wasm).toFixed(2); } if (po) row.to = (best / ms['1.0.0 wasm']).toFixed(2);
    rows.push(row);
  }
  srv.close();
  const cols = [{ key: 'size', title: 'picture', align: 'left' }, { key: 'r', title: 'radius' }].concat(po ? [{ key: '1.0.0 wasm', title: '1.0.0 wasm ms' }] : [], [{ key: 'wasm', title: 'wasm ms' }, { key: 'helpers', title: 'helpers ms' }], same.want === 'threads' ? [{ key: 'threads', title: 'threads ms' }, { key: 'th', title: 'threads / helpers' }, { key: 'tw', title: 'threads / wasm' }] : [], po ? [{ key: 'to', title: 'fastest of threads or helpers / 1.0.0' }] : []);
  console.log('time, lower is better:\n' + T.table(rows, cols));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, inf, same, plain, rows }));
  console.log(same.want === 'threads' ? 'threads ran here' : 'this browser cannot hand shared memory to a worker: the threads route gave way to helpers, info().threads is now false');
  return same.bad.length === 0 && same.smallRoute === 'wasm' && plain.route === 'helpers' && (same.routes[same.want] || 0) > 0;
});
