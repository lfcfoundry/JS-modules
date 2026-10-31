#!/usr/bin/env node
// gpu-blur pools with kept buffers (round 4): helpers route as shipped against kept band buffers (the helper writes into the buffer it got and hands it back), and against that plus a kept output array; threads route (isolated page) the same way. Same bytes first, then times.
// Run: node tests/gpu-blur-pool-reuse-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 9)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 9);
const page = '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>';
const iso = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gb.js': { body: fs.readFileSync(root + 'gpu-blur/gpu-blur.js', 'utf8'), headers: { 'cross-origin-resource-policy': 'same-origin' } }, '/page.html': { body: page, headers: iso } });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => GpuBlur.ready());
  const info = await p.evaluate(() => ({ cores: navigator.hardwareConcurrency, iso: self.crossOriginIsolated })); console.log('cores ' + info.cores + ', isolated ' + info.iso);
  const MODES = { 'wasm 1 thread': { route: 'wasm' }, 'helpers as shipped': { route: 'helpers', _reuse: false }, 'helpers kept bands': { route: 'helpers' }, 'helpers kept bands + out': { route: 'helpers', into: 1 },
    'threads as shipped': { route: 'threads', _reuse: false }, 'threads + kept out': { route: 'threads', into: 1 } };
  const names = Object.keys(MODES).filter((k) => info.iso || !/^threads/.test(k));
  await p.evaluate((M) => {
    window.M = M;
    window.mk = (w, h) => { let s = w ^ h; const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < a.length; i++) a[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24; return a; };
    window.opt = (k, w, h) => { const o = Object.assign({ out: 'pixels', helperMinPixels: 0 }, M[k]); if (o.into) { delete o.into; o._intoPx = (window.OUT && OUT.length === w * h * 4) ? OUT : (window.OUT = new Uint8ClampedArray(w * h * 4)); } return o; };
  }, MODES);
  const same = await p.evaluate(async (names) => {
    const bad = [], routes = {}; let cases = 0;
    const eq = (a, c) => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
    for (const [w, h] of [[641, 359], [97, 13], [1009, 23], [641, 359], [1920, 1080], [641, 360], [1920, 1080]]) for (const r of [1, 12, 100]) {   // sizes go up and down so kept buffers are reused, grown and dropped
      const px = mk(w, h), ref = GpuBlur.blurSync(px, w, h, r, { out: 'pixels', route: 'wasm' }).pixels;
      for (const k of names) { const a = await GpuBlur.blur(px, w, h, r, opt(k, w, h)); routes[a.route] = (routes[a.route] || 0) + 1; cases++; if (!eq(a.pixels, ref)) bad.push(k + ' ' + w + 'x' + h + ' r' + r); }
      if (r === 12) {   // canvas in, canvas out
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(px.slice(), w, h), 0, 0);
        const one = await GpuBlur.blur(c, w, h, r, { out: 'canvas', route: 'wasm' }), ref2 = one.canvas.getContext('2d').getImageData(0, 0, w, h).data;
        for (const k of names.filter((x) => !/1 thread/.test(x))) { const o = Object.assign({ out: 'canvas', helperMinPixels: 0 }, M[k]); delete o.into; const d = await GpuBlur.blur(c, w, h, r, o); cases++; if (!eq(d.canvas.getContext('2d').getImageData(0, 0, w, h).data, ref2)) bad.push(k + ' canvas ' + w + 'x' + h); }
      }
    }
    return { cases, bad, routes };
  }, names);
  console.log('same bytes: ' + same.cases + ' cases, routes ' + JSON.stringify(same.routes) + ', differ: ' + (same.bad.length ? same.bad.slice(0, 6).join('; ') : 'none'));
  const rows = [];
  for (const [w, h] of [[960, 540], [1920, 1080], [3840, 2160]]) {
    await p.evaluate((w, h) => { window.PX = mk(w, h); window.OUT = null; }, w, h);
    const ms = {}; for (const k of names) ms[k] = [];
    for (let r = 0; r < REPS + 2; r++) for (const k of (r % 2 ? names.slice().reverse() : names)) {
      // each mode runs 3 calls in a row (kept buffers only pay off from the second call); the time is the median of those 3
      const v = await p.evaluate(async (k, w, h) => { const t = []; for (let i = 0; i < 3; i++) { const o = opt(k, w, h), t0 = performance.now(); await GpuBlur.blur(PX, w, h, 12, o); t.push(performance.now() - t0); } return t.sort((a, b) => a - b)[1]; }, k, w, h);
      if (r >= 2) ms[k].push(v);
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], one = med(ms['wasm 1 thread']);
    for (const k of names) rows.push({ size: w + 'x' + h, mode: k, ms: med(ms[k]).toFixed(1), vsOne: (one / med(ms[k])).toFixed(2), vsShipped: /helpers|threads/.test(k) ? (med(ms[k.split(' ')[0] + ' as shipped']) / med(ms[k])).toFixed(2) : '' });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'size', title: 'picture (radius 12)', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'ms', title: 'ms' }, { key: 'vsOne', title: 'x faster than 1 thread' }, { key: 'vsShipped', title: 'x faster than as shipped' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, info, same, rows }));
  return same.bad.length === 0;
});
