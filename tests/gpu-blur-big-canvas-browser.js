#!/usr/bin/env node
// gpu-blur, a canvas in on the one-thread route (wasm and JavaScript), big enough that the picture is copied in several bands: every row must come out the same as blurring its bytes.
// Up to 1.2.1, drawing each band with 'copy' wiped the bands before it, so on pictures over 500,000 pixels the top rows came back blank. Run: node tests/gpu-blur-big-canvas-browser.js <chromium|firefox|webkit>
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
T.main(async (b) => {
  const srv = await T.serve({ '/gb.js': fs.readFileSync(root + 'gpu-blur/gpu-blur.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gb.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html'); await p.evaluate(() => GpuBlur.ready());
  const res = await p.evaluate(async () => {
    const out = [];
    for (const [w, h] of [[641, 359], [1000, 1000], [1920, 1080], [777, 1500]]) for (const route of ['wasm', 'js']) {
      let s = w ^ h; const px = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < px.length; i++) px[i] = (i & 3) === 3 ? 255 : (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24;   // opaque, so the canvas trip keeps every byte
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(px.slice(), w, h), 0, 0);
      const ref = GpuBlur.blurSync(px, w, h, 12, { out: 'pixels', route }).pixels;
      for (const o of [{ out: 'pixels' }, { out: 'canvas' }]) {
        const r = await GpuBlur.blur(c, w, h, 12, Object.assign({ route }, o)), a = r.pixels || r.canvas.getContext('2d').getImageData(0, 0, w, h).data;
        let bad = 0, first = -1; for (let i = 0; i < a.length; i++) if (a[i] !== ref[i]) { bad++; if (first < 0) first = Math.floor(i / 4 / w); }
        out.push({ name: w + 'x' + h + ' ' + route + ' canvas->' + o.out, bad, first });
      }
    }
    return out;
  });
  srv.close();
  for (const r of res) console.log((r.bad ? 'FAIL ' : 'ok   ') + r.name + (r.bad ? ': ' + r.bad + ' bytes differ, first at row ' + r.first : ''));
  return res.every((r) => !r.bad);
});
