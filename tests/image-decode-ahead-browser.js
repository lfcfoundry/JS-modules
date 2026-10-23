#!/usr/bin/env node
// image-decode ahead() in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// A stage change needs a 2048 px sheet. Two ways, taking turns, medians of 5: (a) load it when the stage starts (ImageDecode.load), (b) have ImageDecode.ahead() decode it
// in idle time while the previous stage plays and ask for it at the stage change (get). Prints, in ms (smaller is better): the wait at the stage change (request until the sheet
// can be drawn, first draw included), and the longest gap between frames of a playing stage (a loop that spends about 4 ms per frame) while the decoding happens, which for (b) is the stage that is still playing.
// Needs IMG_DIR=/folder/with/sheet2048.{png,webp} (modules/image-decode/test/make-sheets.py). One browser at a time: CHROMIUM=/path/to/chrome node tests/image-decode-ahead-browser.js
// (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web). Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 when nothing can run.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length || !process.env.IMG_DIR) { console.log('skipped: needs IMG_DIR and CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + 'modules/image-decode/image-decode.js', 'utf8'), IMG_DIR = process.env.IMG_DIR;
const types = { png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

function inPage(arg) {
  const ID = (function () { const m = { exports: {} }; new Function('module', arg.src)(m); return m.exports; })();
  const g = document.getElementById('c').getContext('2d'), out = { rows: [], ok: true };
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  async function withFreeze(fn) {   // a playing stage: a drawing loop that spends about 4 ms per frame; the longest gap between frames is the stutter
    let run = true, last = 0, gap = 0;
    const frame = now => { if (last && now - last > gap) gap = now - last; last = now; const e = performance.now(); while (performance.now() - e < 4); if (run) requestAnimationFrame(frame); };
    requestAnimationFrame(frame); await new Promise(r => setTimeout(r, 200)); gap = 0;
    const v = await fn(); run = false; await new Promise(r => setTimeout(r, 40)); return { v, gap };
  }
  const draw = d => { g.clearRect(0, 0, 512, 512); g.drawImage(d, 0, 0, 512, 512); g.getImageData(0, 0, 1, 1); };
  return (async () => {
    for (const fmt of ['png', 'webp']) {
      const demand = [], ahead = [];
      for (let t = 0; t < 6; t++) for (const way of (t % 2 ? ['demand', 'ahead'] : ['ahead', 'demand'])) {
        const url = '/sheet2048.' + fmt + '?n=' + Math.random().toString(36).slice(2);
        if (way === 'demand') {
          const t0 = performance.now(); let d;
          const r = await withFreeze(async () => { d = await ID.load(url); draw(d); return performance.now() - t0; });
          if (t > 0) demand.push({ wait: r.v, gap: r.gap }); ID.close(d);
        } else {
          const h = ID.ahead([url]), r = await withFreeze(async () => { const s = performance.now(); while (!h.ready(0)) await new Promise(x => setTimeout(x, 5)); return performance.now() - s; });
          await new Promise(x => setTimeout(x, 100));
          const t0 = performance.now(), d = await h.get(0); draw(d); const wait = performance.now() - t0;
          if (t > 0) ahead.push({ wait, gap: r.gap, ready: r.v }); h.release(0);
        }
      }
      out.rows.push({ fmt, demandWait: +med(demand.map(x => x.wait)).toFixed(1), demandGap: +med(demand.map(x => x.gap)).toFixed(1), aheadWait: +med(ahead.map(x => x.wait)).toFixed(1), aheadGap: +med(ahead.map(x => x.gap)).toFixed(1), aheadReady: +med(ahead.map(x => x.ready)).toFixed(1) });
    }
    return out;
  })();
}

(async () => {
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>ahead</title><canvas id=c width=512 height=512></canvas>'); }
    const f = path.join(IMG_DIR, path.basename(u));
    if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': types[f.split('.').pop()], 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
    console.log('Browser: ' + await b.version());
    const page = await b.newPage(); await page.goto('http://127.0.0.1:' + port + '/');
    const o = await page.evaluate(inPage, { src: SRC });
    console.log('ms, smaller is better; wait at the stage change (load when asked / ahead), longest freeze while decoding (load / ahead), ahead ready after; median of 5');
    for (const r of o.rows) console.log('  2048 ' + r.fmt.padEnd(5) + 'wait ' + r.demandWait + ' / ' + r.aheadWait + '; freeze ' + r.demandGap + ' / ' + r.aheadGap + '; ahead ready after ' + r.aheadReady);
    if (process.env.OUT) fs.writeFileSync(process.env.OUT.replace('%', kind), JSON.stringify({ browser: await b.version(), rows: o.rows }));
    await b.close();
  }
  srv.close();
})().catch(e => { console.error(e); process.exit(2); });
