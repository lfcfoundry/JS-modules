#!/usr/bin/env node
// memory-compression pager() in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// Exactness: 20,000 link-like objects read back equal through pages, background packing, edits, release, pressure and a real IndexedDB spill round trip.
// Timing (ms, lower is better): opening one closed page (median / 90th percentile of 30 pages), the first read of a row from the whole packed list (view),
// packing 60,000 links into pages all at once against background (longest freeze), and bringing one page back from browser storage.
// One browser at a time: CHROMIUM=/path/to/chrome node tests/memory-compression-pager-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run. Exit 1 on a failed check.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'memory-compression', 'memory-compression.js'), 'utf8');
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }

function battery(src) {
  new Function(src + '\nwindow.MemoryCompression = MemoryCompression;').call(window);
  const L = window.MemoryCompression, out = { checks: {}, ms: {} };
  const kinds = ['road', 'rail', 'ferry', 'air', 'path'];
  const links = n => { let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; const a = []; for (let i = 0; i < n; i++) a.push({ id: i, from: 'n' + Math.floor(r() * n / 3), to: 'n' + Math.floor(r() * n / 3), w: Math.round(r() * 1000) / 10, kind: kinds[i % 5], flag: r() < 0.3, note: r() < 0.5 ? null : 'link ' + (i % 97) }); return a; };
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; }, p90 = a => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length * 0.9)]; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mark = (k, ok) => { out.checks[k] = !!ok; };
  return (async () => {
    const d = links(20000);
    for (const bg of [false, true]) {
      const P = L.pager(d.slice(), { pageRows: 1024, livePages: 2, background: bg, mode: 'fast' }); if (bg) await P.ready;
      let bad = 0; if (!same(P.range(0), d)) bad++;
      for (let i = 0; i < d.length; i += 29) if (!same(P.get(i), d[i])) bad++;
      P.set(7, { z: 1 }); P.release(); if (!same(P.get(7), { z: 1 })) bad++;
      let c = 0; await P.each(o => { c += o.length; }); if (c !== d.length) bad++;
      P.pressure(2); if (P.memory().open !== 0) bad++; P.pressure(0);
      mark('pages' + (bg ? ' packed in the background' : '') + ': every row equal, after set, release, each and pressure', bad === 0);
    }
    const S = L.pager(d.slice(), { pageRows: 1024, livePages: 2, spill: true, mode: 'fast' }); let bad = 0;
    try {
      await S.spill({ all: true }); const m = S.memory();
      if (m.packed !== 0 && m.open !== 0) bad++;
      for (let i = 0; i < d.length; i += 57) { const o = await S.getAsync(i); if (!same(o, d[i])) bad++; }
      let threw = false; await S.spill({ all: true }); try { S.get(5); } catch (e) { threw = true; } if (!threw) bad++;
      await S.load(5); if (!same(S.get(5), d[5])) bad++;
    } catch (e) { bad++; out.error = String(e && e.message || e); }
    try { await S.dispose(); } catch (e) { /* ignore */ }
    mark('spill to IndexedDB: every row sampled equal after the round trip, a spilled page asks to be loaded first', bad === 0);

    const big = links(60000);
    const packed = L.pack(big, { mode: 'fast' }), V = L.view(packed);
    const t0 = performance.now(); V.get(31234); out.ms.viewFirstRead = performance.now() - t0;
    const P = L.pager(big.slice(), { pageRows: 2048, livePages: 1, readAhead: false, mode: 'fast' }), opens = [];
    for (let k = 0; k < 29; k++) { const row = ((k * 7) % 29) * 2048 + 5; const t = performance.now(); P.get(row); opens.push(performance.now() - t); }
    out.ms.open = [med(opens), p90(opens)];
    async function freeze(bg) {
      let run = true, last = performance.now(), worst = 0; const ch = new MessageChannel();
      ch.port1.onmessage = () => { const n = performance.now(); if (n - last > worst) worst = n - last; last = n; if (run) ch.port2.postMessage(0); };
      ch.port2.postMessage(0); await new Promise(r => setTimeout(r, 30)); worst = 0; last = performance.now();
      const Q = L.pager(big.slice(), { pageRows: 2048, background: bg, mode: 'fast' }); if (bg) await Q.ready;
      run = false; await new Promise(r => setTimeout(r, 20)); return worst;
    }
    const fa = [], fb = []; for (let t = 0; t < 3; t++) { fa.push(await freeze(false)); fb.push(await freeze(true)); }
    out.ms.freezeAll = med(fa); out.ms.freezeBackground = med(fb);
    const R = L.pager(big.slice(), { pageRows: 2048, livePages: 1, readAhead: false, spill: true, mode: 'fast' }), back = [];
    await R.spill({ all: true });
    for (let k = 0; k < 20; k++) { const t = performance.now(); await R.load(((k * 7) % 29) * 2048 + 5); back.push(performance.now() - t); }
    out.ms.back = [med(back), p90(back)]; try { await R.dispose(); } catch (e) { /* ignore */ }
    return out;
  })();
}

(async () => {
  let bad = 0;
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>pager</title>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));   // an http page, so IndexedDB works the same in every browser
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); await p.goto('http://127.0.0.1:' + srv.address().port + '/');
    const r = await p.evaluate(battery, SRC);
    for (const k of Object.keys(r.checks)) { console.log((r.checks[k] ? '  ok   ' : '  FAIL ') + k); if (!r.checks[k]) bad++; }
    if (r.error) console.log('  error: ' + r.error);
    const f = x => (Math.round(x * 100) / 100).toString();
    console.log('  ms (lower is better): open one closed page ' + f(r.ms.open[0]) + ' / ' + f(r.ms.open[1]) + ' (median / 90th percentile); first read from the whole packed list ' + f(r.ms.viewFirstRead) +
      '; longest freeze packing 60,000 links all at once ' + f(r.ms.freezeAll) + ', background ' + f(r.ms.freezeBackground) + '; page back from browser storage ' + f(r.ms.back[0]) + ' / ' + f(r.ms.back[1]));
    await b.close();
  }
  srv.close(); console.log(bad ? bad + ' check(s) failed' : 'all checks passed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
