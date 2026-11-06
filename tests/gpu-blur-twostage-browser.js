#!/usr/bin/env node
// Copyright (c) 2026 LFC Foundry. MIT License.
// gpu-blur WebGL 2 two-stage box (boxes 25 pixels and wider, radius 24 up; the private _two switch forces it on and off at every radius here): same bytes as the one-stage way and the JavaScript reference for pixels out, a drawn canvas out and a texture out,
// over many radii (a box width that splits evenly, prime widths, the widest) and odd picture sizes (edges), with the private _two switch forcing each way.
// Run: node tests/gpu-blur-twostage-browser.js <chromium|firefox|webkit> [out.json]     Without WebGL 2 in the browser the check says so and passes.
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
const page = '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gb.js': { body: fs.readFileSync(process.env.GB || root + 'gpu-blur/gpu-blur.js', 'utf8'), headers: { 'cross-origin-resource-policy': 'same-origin' } }, '/page.html': { body: page } });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => GpuBlur.ready());
  const gl = await p.evaluate(() => GpuBlur.info().webgl2); console.log('webgl2 ' + gl);
  if (!gl) { console.log('no WebGL 2 here: two-stage check skipped'); srv.close(); return true; }
  const res = await p.evaluate(async () => {
    const bad = [], eq = (a, c) => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; }; let cases = 0;
    const mk = (w, h, op) => { let s = w * 7919 + h * 104729; const a = new Uint8Array(w * h * 4); for (let i = 0; i < a.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; a[i] = (i & 3) === 3 && op ? 255 : s >>> 24; } return a; };
    for (const [w, h] of [[97, 61], [301, 197], [64, 64], [130, 9], [9, 130], [512, 300]]) for (const r of [1, 6, 10, 12, 13, 16, 20, 24, 25, 30, 40, 50, 60, 80, 100]) {
      const px = mk(w, h, false), ref = GpuBlur.reference(px, w, h, r);
      for (const two of [false, true]) {
        const a = await GpuBlur.blur(px, w, h, r, { out: 'pixels', route: 'webgl2', _two: two }); cases++;
        if (a.route !== 'webgl2' || !eq(a.pixels, ref)) bad.push('pixels ' + w + 'x' + h + ' r' + r + ' two=' + two);
      }
    }
    for (const [w, h, r] of [[97, 61, 12], [301, 197, 24], [64, 64, 50], [130, 9, 30], [9, 130, 40], [300, 300, 100]]) {
      const px = mk(w, h, true), ref = GpuBlur.reference(px, w, h, r);
      for (const two of [false, true]) {
        const c = await GpuBlur.blur(px, w, h, r, { out: 'canvas', route: 'webgl2', _two: two }); cases++;
        if (!eq(c.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, ref)) bad.push('canvas ' + w + 'x' + h + ' r' + r + ' two=' + two);
        const cv = document.createElement('canvas'), g = cv.getContext('webgl2'), t = await GpuBlur.blur(px, w, h, r, { out: 'texture', route: 'webgl2', gl: g, _two: two }); cases++;
        const fb = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t.texture, 0);
        const rp = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, rp); if (!eq(rp, ref)) bad.push('texture ' + w + 'x' + h + ' r' + r + ' two=' + two);
      }
    }
    return { bad, cases };
  });
  srv.close();
  console.log(res.cases + ' cases, ' + res.bad.length + ' different' + (res.bad.length ? ': ' + res.bad.slice(0, 8).join('; ') : ''));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, res }));
  return res.bad.length === 0;
});
