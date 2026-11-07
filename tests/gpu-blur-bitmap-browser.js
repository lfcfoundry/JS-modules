#!/usr/bin/env node
// Copyright (c) 2026 LFC Foundry. MIT License.
// gpu-blur out 'bitmap' (1.4.0): the bytes route, then an ImageBitmap the browser can show without copying pixels into a 2D canvas. Checks that the bitmap, drawn into a 2D canvas, holds the same picture as the plain JavaScript reference (compared with the same bytes put through putImageData: opaque pictures exactly, see-through pixels within 1 level, because a 2D canvas keeps premultiplied colors), over several sizes and radii and the helpers and wasm routes, and that blurSync refuses it.
// Run: node tests/gpu-blur-bitmap-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
const page = '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gb.js': { body: fs.readFileSync(process.env.GB || root + 'gpu-blur/gpu-blur.js', 'utf8'), headers: { 'cross-origin-resource-policy': 'same-origin' } }, '/page.html': { body: page } });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => GpuBlur.ready());
  const res = await p.evaluate(async () => {
    const bad = []; let cases = 0;
    const mk = (w, h, op) => { let s = w * 7919 + h * 104729; const a = new Uint8Array(w * h * 4); for (let i = 0; i < a.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; a[i] = s >>> 24; } if (op) for (let i = 3; i < a.length; i += 4) a[i] = 255; return a; };
    for (const [w, h, r] of [[97, 61, 6], [301, 197, 12], [512, 300, 24], [64, 64, 3]]) for (const route of ['wasm', 'helpers', 'auto']) for (const op of [true, false]) {
      const px = mk(w, h, op), ref = GpuBlur.reference(px, w, h, r);
      const x = await GpuBlur.blur(px, w, h, r, { out: 'bitmap', route }); cases++;
      if (!(x.bitmap instanceof ImageBitmap) || x.bitmap.width !== w || x.bitmap.height !== h || x.pixels) { bad.push('shape ' + w + 'x' + h + ' r' + r + ' ' + route + ' op=' + op); continue; }
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(x.bitmap, 0, 0); x.bitmap.close();
      const d = g.getImageData(0, 0, w, h).data, c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.putImageData(new ImageData(new Uint8ClampedArray(ref), w, h), 0, 0);
      const base = g2.getImageData(0, 0, w, h).data; let worst = 0; for (let i = 0; i < d.length; i++) { const e = Math.abs(d[i] - base[i]); if (e > worst) worst = e; }   // against the same bytes put through putImageData: a 2D canvas keeps premultiplied colors, so see-through pixels round the same way on both
      if (worst > (op ? 0 : 1)) bad.push('bytes ' + w + 'x' + h + ' r' + r + ' ' + route + ' op=' + op + ' worst ' + worst);
    }
    let refused = false; try { GpuBlur.blurSync(mk(8, 8, true), 8, 8, 2, { out: 'bitmap' }); } catch (e) { refused = true; } cases++; if (!refused) bad.push('blurSync did not refuse');
    return { bad, cases };
  });
  srv.close();
  console.log(res.cases + ' cases, ' + res.bad.length + ' different' + (res.bad.length ? ': ' + res.bad.slice(0, 8).join('; ') : ''));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, res }));
  return res.bad.length === 0;
});
