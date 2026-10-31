#!/usr/bin/env node
// gpu-blur opts.into for out 'pixels': every route writes into the array the caller passes (result.pixels is that array), same bytes as a fresh array;
// a wrong-length array is left alone; a canvas in opts.into still works for out 'canvas'. Then times with and without it, alone and stacked with kept helper bands.
// Run: node tests/gpu-blur-into-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 9), SAME_ONLY=1 skips the times
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 9);
const page = '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>';
const iso = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gb.js': { body: fs.readFileSync(process.env.GB || root + 'gpu-blur/gpu-blur.js', 'utf8'), headers: { 'cross-origin-resource-policy': 'same-origin' } }, '/page.html': { body: page, headers: iso } });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => GpuBlur.ready());
  const info = await p.evaluate(() => ({ cores: navigator.hardwareConcurrency, iso: self.crossOriginIsolated, gl: GpuBlur.info().webgl2 })); console.log('cores ' + info.cores + ', isolated ' + info.iso + ', webgl2 ' + info.gl);
  const routes = ['js', 'wasm', 'helpers', 'auto'].concat(info.gl ? ['webgl2'] : [], info.iso ? ['threads'] : []);
  await p.evaluate(() => { window.mk = (w, h) => { let s = w ^ h; const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < a.length; i++) a[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24; return a; }; });
  const same = await p.evaluate(async (routes) => {
    const bad = [], ran = {}; let cases = 0;
    const eq = (a, c) => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
    for (const [w, h] of [[641, 359], [97, 13], [1920, 1080], [641, 359]]) for (const r of [1, 12, 100]) {
      const px = mk(w, h), ref = GpuBlur.reference(px, w, h, r), n = w * h * 4;
      for (const route of routes) {
        const o = { out: 'pixels', route, helperMinPixels: 0 };
        const kinds = { clamped: new Uint8ClampedArray(n).fill(7), plain: new Uint8Array(n).fill(7), offset: new Uint8ClampedArray(new ArrayBuffer(n + 64), 32, n).fill(7) };
        for (const kind in kinds) {
          const into = kinds[kind], a = await GpuBlur.blur(px, w, h, r, Object.assign({ into }, o)); ran[a.route] = (ran[a.route] || 0) + 1; cases++;
          if (a.pixels !== into || !eq(into, ref)) bad.push(route + ' ' + kind + ' ' + w + 'x' + h + ' r' + r + (a.pixels !== into ? ' (not the given array)' : ''));
          if (/^(js|wasm|webgl2)$/.test(route)) { into.fill(7); const s = GpuBlur.blurSync(px, w, h, r, Object.assign({ into }, o)); cases++; if (s.pixels !== into || !eq(into, ref)) bad.push('sync ' + route + ' ' + kind + ' ' + w + 'x' + h); }
        }
        const wrong = new Uint8ClampedArray(n - 4).fill(7), c = await GpuBlur.blur(px, w, h, r, Object.assign({ into: wrong }, o)); cases++;
        if (c.pixels === wrong || !eq(c.pixels, ref) || wrong.some((v) => v !== 7)) bad.push(route + ' wrong length ' + w + 'x' + h);
      }
      if (r === 12) {
        const src = document.createElement('canvas'); src.width = w; src.height = h; const op = px.slice(); for (let i = 3; i < op.length; i += 4) op[i] = 255;   // opaque: a 2D canvas keeps colors premultiplied, and WebKit rounds a WebGL canvas drawn into one differently (up to 3 levels where alpha < 255; 1.2.3 does the same)
        src.getContext('2d').putImageData(new ImageData(op, w, h), 0, 0);
        const ref2 = (await GpuBlur.blur(src, w, h, r, { out: 'canvas', route: 'wasm' })).canvas.getContext('2d').getImageData(0, 0, w, h).data;
        for (const route of routes) { const cv = document.createElement('canvas'), d = await GpuBlur.blur(src, w, h, r, { out: 'canvas', route, into: cv, helperMinPixels: 0 }); cases++; if (d.canvas !== cv || !eq(cv.getContext('2d').getImageData(0, 0, w, h).data, ref2)) bad.push(route + ' canvas into ' + w + 'x' + h); }
      }
    }
    return { cases, bad, ran };
  }, routes);
  console.log('same bytes: ' + same.cases + ' cases, routes ' + JSON.stringify(same.ran) + ', differ: ' + (same.bad.length ? same.bad.slice(0, 8).join('; ') : 'none'));
  if (process.env.SAME_ONLY) { srv.close(); return same.bad.length === 0; }
  // times: each route with a fresh array per call (as 1.2.3) against opts.into; helpers also as 1.2.2 (no kept bands, fresh array) against both kept (the stack)
  const MODES = {};
  for (const r of routes.filter((x) => x !== 'auto' && x !== 'js' && (x !== 'webgl2' || process.env.TIME_GL)))   // webgl2 runs in software in test machines: TIME_GL=1 times it too
    { MODES[r + ' fresh'] = { route: r }; MODES[r + ' into'] = { route: r, into: 1 }; }
  MODES['helpers 1.2.2 way'] = { route: 'helpers', _reuse: false };
  if (info.iso) MODES['threads 1.2.2 way'] = { route: 'threads', _reuse: false };
  const names = Object.keys(MODES), rows = [];
  for (const [w, h] of [[960, 540], [1920, 1080], [3840, 2160]]) {
    await p.evaluate((w, h, M) => { window.PX = mk(w, h); window.OUT = new Uint8ClampedArray(w * h * 4); window.M = M; }, w, h, MODES);
    const ms = {}; for (const k of names) ms[k] = [];
    for (let r = 0; r < REPS + 2; r++) for (const k of (r % 2 ? names.slice().reverse() : names)) {
      const v = await p.evaluate(async (k, w, h) => { const t = []; for (let i = 0; i < 3; i++) { const o = Object.assign({ out: 'pixels', helperMinPixels: 0 }, M[k]); if (o.into) o.into = OUT; const t0 = performance.now(); await GpuBlur.blur(PX, w, h, 12, o); t.push(performance.now() - t0); } return t.sort((a, b) => a - b)[1]; }, k, w, h);
      if (r >= 2) ms[k].push(v);
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    for (const k of names) { const base = k.split(' ')[0]; rows.push({ size: w + 'x' + h, mode: k, ms: med(ms[k]).toFixed(1), vsFresh: (med(ms[base + ' fresh']) / med(ms[k])).toFixed(2), vsOld: ms[base + ' 1.2.2 way'] ? (med(ms[base + ' 1.2.2 way']) / med(ms[k])).toFixed(2) : '' }); }
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'size', title: 'picture (radius 12)', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'ms', title: 'ms' }, { key: 'vsFresh', title: 'x faster than fresh array' }, { key: 'vsOld', title: 'x faster than 1.2.2 way' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, info, same, rows }));
  return same.bad.length === 0;
});
