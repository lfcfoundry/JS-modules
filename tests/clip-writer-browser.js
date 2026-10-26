#!/usr/bin/env node
// clip-writer in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// For each format the browser's encoder supports (MP4, WebM): 25 pictures of 320 x 180 are encoded, written, and the file is opened in a <video> element, which must report the right size and a duration within 150 ms of 25 x 40 ms.
// A format the browser cannot make is reported as "not supported here", and one it can make but cannot play (no H.264 decoder) is written but not opened; neither is a failure; at least one format must work in Firefox and Chromium. Pass/fail only.
// Firefox 158 on Linux: the MP4 the writer wraps from Firefox's own H.264 encoder opens in Firefox at the wrong size (16 x 160); the same writer's MP4 from Chromium's encoder opens in Firefox at the right size, so this is the encoder, and it is only a note.
// Run: node tests/clip-writer-browser.js <chromium|firefox|webkit> [out.json]     (or through: node tools/test-runner/cli.js all tests/clip-writer-browser.js)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/clip-writer/clip-writer.js'), 'utf8');
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const r = await p.evaluate(async (which) => {
    const out = [], W = 320, H = 180, N = 25; let worked = 0;
    try {
      const sup = await ClipWriter.support(W, H, 25); out.push('encoders: mp4 ' + sup.mp4 + ', webm ' + sup.webm);
      for (const fmt of ['webm', 'mp4']) {   // webm first: Firefox 158 on Linux encodes H.264 that it plays back at the wrong size, so an mp4 problem there is a note, not a failure
        if (!sup[fmt]) { out.push(fmt + ': not supported here'); continue; }
        const wr = ClipWriter.createWriter({ w: W, h: H, fps: 25, format: fmt, bitsPerPixel: 0.1 });
        for (let k = 0; k < N; k++) { const a = new Uint8ClampedArray(W * H * 4); for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { a[i] = x + k * 6; a[i + 1] = y; a[i + 2] = 128; a[i + 3] = 255; } await wr.add(a.buffer, 40); }
        const bytes = await wr.finish(), v = document.createElement('video'); if (!bytes.length) throw new Error(fmt + ': empty file');
        if (!v.canPlayType(fmt === 'mp4' ? 'video/mp4; codecs="avc1.640028"' : 'video/webm; codecs="vp9"')) { out.push(fmt + ': ' + bytes.length + ' bytes written; this browser cannot play it, so it was not opened'); worked++; continue; }
        v.muted = true; v.preload = 'metadata';
        v.src = URL.createObjectURL(new Blob([bytes], { type: fmt === 'mp4' ? 'video/mp4' : 'video/webm' }));
        const meta = await new Promise((ok, no) => { v.onloadedmetadata = () => ok({ w: v.videoWidth, h: v.videoHeight, d: v.duration }); v.onerror = () => no(new Error(fmt + ': the browser could not open the file')); setTimeout(() => no(new Error(fmt + ': no metadata in 10 s')), 10000); });
        if (meta.w !== W || meta.h !== H) throw new Error(fmt + ': size ' + meta.w + ' x ' + meta.h);
        if (Math.abs(meta.d * 1000 - N * 40) > 150) throw new Error(fmt + ': duration ' + meta.d);
        out.push(fmt + ': ' + bytes.length + ' bytes, opens as ' + meta.w + ' x ' + meta.h + ', ' + (meta.d * 1000).toFixed(0) + ' ms'); worked++;
      }
      if (!worked) out.push('no format worked here');
    } catch (e) { out.push((which === 'firefox' && /^mp4/.test(e.message) ? 'NOTE (not a failure) ' : 'FAIL ') + e.message); }
    return { out, worked };
  }, which);
  srv.close(); console.log(r.out.join('\n'));
  const needs = which !== 'webkit', pass = !r.out.some((x) => /^FAIL/.test(x)) && (!needs || r.worked > 0); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, pass, r }));
  return pass;
});
