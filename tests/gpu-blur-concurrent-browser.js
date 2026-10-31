#!/usr/bin/env node
// gpu-blur helpers route, calls that overlap: a quick blur that finishes while a long one still runs must not start the closing clock under it
// (1.2.x: with idleMs 0 the quick call closed the helpers and the long call failed). Both answers must be the one-thread wasm bytes and come from the helpers.
// Run: node tests/gpu-blur-concurrent-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
const page = '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gb.js': fs.readFileSync(root + 'gpu-blur/gpu-blur.js', 'utf8'), '/page.html': page });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const r = await p.evaluate(async () => {
    await GpuBlur.ready(); let s = 3; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24;
    const mk = (w, h) => { const px = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < px.length; i++) px[i] = rnd(); return px; };
    const eq = (a, c) => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
    const W = 2560, H = 1440, big = mk(W, H), small = mk(97, 61), refB = GpuBlur.blurSync(big, W, H, 40, { out: 'pixels', route: 'wasm' }).pixels, refS = GpuBlur.blurSync(small, 97, 61, 3, { out: 'pixels', route: 'wasm' }).pixels;
    const o = { out: 'pixels', route: 'helpers', workers: 3, helperMinPixels: 0, idleMs: 0 }, res = { rounds: 0, bad: [] };
    for (let k = 0; k < 4; k++) {
      const quick = GpuBlur.blur(small, 97, 61, 3, o).then((x) => x, (e) => ({ err: String(e && e.message || e) }));   // posted first, so the helpers finish it first
      const long = GpuBlur.blur(big, W, H, 40, o).then((x) => x, (e) => ({ err: String(e && e.message || e) }));
      const [a, q] = await Promise.all([long, quick]); res.rounds++;
      if (a.err || a.route !== 'helpers' || !eq(a.pixels, refB)) res.bad.push('long call: ' + (a.err || a.route));
      if (q.err || q.route !== 'helpers' || !eq(q.pixels, refS)) res.bad.push('quick call: ' + (q.err || q.route));
    }
    await new Promise((ok) => setTimeout(ok, 50)); GpuBlur.release(); return res;
  });
  srv.close();
  console.log('overlapping helper calls: ' + r.rounds + ' rounds, problems: ' + (r.bad.length ? r.bad.slice(0, 4).join('; ') : 'none'));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r }));
  return r.bad.length === 0;
});
