#!/usr/bin/env node
// image-decode real-browser check. Copyright (c) 2026 LFC Foundry. MIT License.
// In each real browser, one at a time: (1) the same small picture in PNG, lossless WebP and AVIF is loaded the two ways and through 'auto', and the
// pixels must be identical across ways (and equal to a PNG drawn the plain way); a format the browser cannot read must report supports() false and
// load() must reject, not hang. (2) With IMG_DIR=/folder/with/sheet1024.{png,webp,avif} and sheet2048.* (made by modules/image-decode/test/make-sheets.py) it times the plain way (Image + onload, drawn at first use) against ImageDecode.load: ms, smaller is better: total = start to drawn,
// draw = the first drawImage, freeze = longest main-thread freeze measured by a message loop; medians of 7. (3) A list of 8 sheets, plain one after
// another against loadAll with 2 at a time.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/image-decode-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run. Exit 1 on a failed check.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + 'modules/image-decode/image-decode.js', 'utf8');
const IMG_DIR = process.env.IMG_DIR || '';
const FIX = {"png": "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAABcUlEQVR4nM2Vb2+CMBCHf25uc/8VHQJaMHNsGqL7/t9uLwjksL322qGSPC/urj+SJ9cmjADcDYkxJgBGw6EVuhkIVOh2CJwIja+OLnTlZ20Uur8inNDDBaloaxGanIfSHrALPfbBxivvFHoKRYV9KBF69iHzzJ8iFHoRkMhidn7lQq88sfXUSUVbL6E3jYVpKGRnnPsKvRPm3VZIaQ8ECE2BKRA1hZytJBYmNPNh45UPEIqAGRDJKMTJCDgCka/QvNlQBMytKFegpaKtl9CCXFkttDCxYuY6e30Y/IZaoY8umTYx8sMdyYViXihuSEnNUdoDvWwoBpZAAiytbF2BpfzXkbiEEhefrsChLnrZUNpsKDWxYeYtFW0lQplVKCNXlgJZl0KbUPb68J8bWnXfUC20ashJrbMzzvt91K3QGlDAmuGbP1o7hRQvpHghxVPyR0dAnWNDebOhXOPLNKw51EWwUMEIFeTKcqAgbLttS0XbPzEPTQzNtPrQAAAAAElFTkSuQmCC", "webp": "UklGRjwBAABXRUJQVlA4TDABAAAvL8AHALkyRPQ/FmraNmDKH3O/DaH80f8JIPQBt20jSRLNzT/m6eqe3ntcA2nbhrLtdyRJktoqUomZmSUzM9tXhwK3bZSMjvk+geDZlgewLX8VpEWQD9gtwnItgwpAv1iMAsC42QQDaIc7nYIB9MONAtcZKKMWGAAcxhkscmgFDYDjRTEeDXTgApurJpMxOa6+Q3z6bs89eM26sIB9NyTfFqzcAxFYQBJs4DTIoJDnm6OGJDjA9boYlxECmMBl1gSDNkHAPP23OCTW2BGyTEfPLHbgFcGgT2mWo2vHAJ7jYtxQi06fbolLV4wS6jHCaDjMw05ZX3RDDLPisw5deK68QwK2dViWtU0ClbFeFYuarkbCCU4ouV85nFpLxbO+Yv4wAZ99maiORscPDsi4AQAA", "avif": "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"};
const types = { png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

function inPage(arg) {
  const ID = (function () { const m = { exports: {} }; new Function('module', arg.src)(m); return m.exports; })();
  const out = { checks: {}, rows: [], list: null, strategy: ID.strategy };
  const g = document.getElementById('c').getContext('2d', { willReadFrequently: true });
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const hash = d => { let h = 2166136261; const px = g.getImageData(0, 0, 48, 32).data; for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 16777619) >>> 0; return h; };
  const plain = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('plain load failed')); i.src = u; });
  const mark = (name, ok, extra) => { out.checks[name + (extra ? ' (' + extra + ')' : '')] = !!ok; };
  return (async () => {
    // (1) correctness
    const ref = await plain('data:image/png;base64,' + arg.fix.png); g.clearRect(0, 0, 48, 32); g.drawImage(ref, 0, 0); const refHash = hash();
    for (const fmt of ['png', 'webp', 'avif']) {
      const uri = 'data:' + { png: 'image/png', webp: 'image/webp', avif: 'image/avif' }[fmt] + ';base64,' + arg.fix[fmt];
      const can = await ID.supports(fmt); out['supports ' + fmt] = can;
      if (!can) { let rejected = false; try { await Promise.race([ID.load(uri), new Promise((_, rj) => setTimeout(() => rj(new Error('hang')), 5000))]); } catch (e) { rejected = e.message !== 'hang'; } mark(fmt + ' unreadable: load() rejects and does not hang', rejected); continue; }
      const hs = {};
      for (const way of ['auto', 'bitmap', 'decode']) {
        const d = await ID.load(uri, { strategy: way }); g.clearRect(0, 0, 48, 32); g.drawImage(d, 0, 0); hs[way] = hash(); mark(fmt + ' ' + way + ' gives a drawable of 48 x 32', (d.width || d.naturalWidth) === 48 && (d.height || d.naturalHeight) === 32); ID.close(d);
      }
      mark(fmt + ': bitmap, decode and auto draw the same pixels', hs.auto === hs.bitmap && hs.bitmap === hs.decode);
      if (fmt !== 'avif') mark(fmt + ' pixels equal the plain PNG', hs.auto === refHash);
    }
    const bytes = Uint8Array.from(atob(arg.fix.png), c => c.charCodeAt(0)); const d2 = await ID.load(bytes); g.clearRect(0, 0, 48, 32); g.drawImage(d2, 0, 0); mark('bytes in, same pixels', hash() === refHash);
    const list = await ID.loadAll([bytes, 'data:image/png;base64,' + arg.fix.png, new Uint8Array(40)], { concurrency: 2 }); mark('loadAll: two good, one bad gives null for the bad', list[0] && list[1] && list[2] === null && list.errors[2]);
    out.pick = await ID.pick({ avif: 'a.avif', webp: 'a.webp', png: 'a.png' });
    if (!arg.timing) return out;

    // (2) timing
    const W = (m, url) => m;
    async function once(method, url) {
      const blob = await (await fetch(url, { cache: 'no-store' })).blob();
      let run = true, last = performance.now(), maxGap = 0; const ch = new MessageChannel();
      ch.port1.onmessage = () => { const n = performance.now(); if (n - last > maxGap) maxGap = n - last; last = n; if (run) ch.port2.postMessage(0); };
      ch.port2.postMessage(0); await new Promise(r => setTimeout(r, 30)); maxGap = 0; last = performance.now();
      const t0 = performance.now(); let src;
      if (method === 'plain') src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
      else src = await ID.load(blob, { strategy: method });
      const t1 = performance.now(); g.clearRect(0, 0, 512, 512); g.drawImage(src, 0, 0, 512, 512); g.getImageData(0, 0, 1, 1);
      const draw = performance.now() - t1, total = performance.now() - t0; run = false; await new Promise(r => setTimeout(r, 20)); ID.close(src);
      return { total, draw, gap: maxGap };
    }
    const methods = ['plain', 'auto', 'bitmap', 'decode'];
    for (const size of [1024, 2048]) for (const fmt of ['png', 'webp', 'avif']) {
      const url = '/sheet' + size + '.' + fmt;
      if (!(await ID.supports(fmt))) { out.rows.push({ size, fmt, skip: true }); continue; }
      const acc = {}; methods.forEach(m => acc[m] = []);
      await once('auto', url);
      for (let t = 0; t < 7; t++) for (let k = 0; k < methods.length; k++) { const m = methods[(k + t) % methods.length]; acc[m].push(await once(m, url)); }
      const row = { size, fmt }; for (const m of methods) row[m] = { total: +med(acc[m].map(x => x.total)).toFixed(1), draw: +med(acc[m].map(x => x.draw)).toFixed(1), gap: +med(acc[m].map(x => x.gap)).toFixed(1) };
      out.rows.push(row);
    }
    // (3) a list of 8 sheets
    const urls = Array.from({ length: 8 }, (_, i) => '/sheet1024.png?n=' + i), res = { plain: [], list: [] };
    async function listRun(kind) {
      let run = true, last = performance.now(), maxGap = 0; const ch = new MessageChannel();
      ch.port1.onmessage = () => { const n = performance.now(); if (n - last > maxGap) maxGap = n - last; last = n; if (run) ch.port2.postMessage(0); };
      ch.port2.postMessage(0); await new Promise(r => setTimeout(r, 30)); maxGap = 0; last = performance.now();
      const t0 = performance.now(); let first = 0, items;
      if (kind === 'plain') { items = []; for (const u of urls) { const b = await (await fetch(u + '&r=' + Math.random(), { cache: 'no-store' })).blob(); items.push(await new Promise((rs, rj) => { const i = new Image(); i.onload = () => rs(i); i.onerror = rj; i.src = URL.createObjectURL(b); })); if (!first) first = performance.now() - t0; } }
      else { items = await ID.loadAll(urls.map(u => u + '&r=' + Math.random()), { concurrency: 2, onEach: () => { if (!first) first = performance.now() - t0; } }); }
      const t1 = performance.now(); for (const it of items) { g.drawImage(it, 0, 0, 64, 64); } g.getImageData(0, 0, 1, 1);
      const draws = performance.now() - t1, total = performance.now() - t0; run = false; await new Promise(r => setTimeout(r, 20));
      return { total, first, draws, gap: maxGap };
    }
    await listRun('list');
    for (let t = 0; t < 5; t++) for (const k of (t % 2 ? ['list', 'plain'] : ['plain', 'list'])) res[k].push(await listRun(k));
    out.list = {}; for (const k of ['plain', 'list']) out.list[k] = { total: +med(res[k].map(x => x.total)).toFixed(1), first: +med(res[k].map(x => x.first)).toFixed(1), draws: +med(res[k].map(x => x.draws)).toFixed(1), gap: +med(res[k].map(x => x.gap)).toFixed(1) };
    return out;
  })();
}

(async () => {
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>image-decode</title><canvas id=c width=512 height=512></canvas>'); }
    const f = IMG_DIR && path.join(IMG_DIR, path.basename(u));
    if (!f || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': types[f.split('.').pop()], 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  let fails = 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
    console.log('Browser: ' + await b.version());
    const page = await b.newPage(); await page.goto('http://127.0.0.1:' + port + '/');
    const o = await page.evaluate(inPage, { src: SRC, fix: FIX, timing: !!IMG_DIR });
    console.log('auto uses: ' + o.strategy + '; reads: ' + ['png', 'webp', 'avif'].map(f => f + ' ' + (o['supports ' + f] ? 'yes' : 'no')).join(', ') + '; pick(avif, webp, png) = ' + o.pick);
    for (const k of Object.keys(o.checks)) { console.log((o.checks[k] ? '  ok   ' : '  FAIL ') + k); if (!o.checks[k]) fails++; }
    if (o.rows.length) {
      console.log('ms, smaller is better: total / first draw / longest freeze, median of 7');
      for (const r of o.rows) { if (r.skip) { console.log(String(r.size).padStart(5), r.fmt.padEnd(5), 'not readable here'); continue; } console.log(String(r.size).padStart(5), r.fmt.padEnd(5), ['plain', 'auto', 'bitmap', 'decode'].map(m => m.padEnd(6) + String(r[m].total).padStart(6) + ' /' + String(r[m].draw).padStart(6) + ' /' + String(r[m].gap).padStart(6)).join(' | ')); }
      console.log('list of 8 sheets (1024 PNG): ms, smaller is better; first = first picture ready, draws = drawing all 8, freeze = longest main-thread freeze; median of 5');
      for (const k of ['plain', 'list']) { const r = o.list[k]; console.log('  ' + (k === 'plain' ? 'plain, one after another' : 'loadAll, 2 at a time').padEnd(26), 'total', String(r.total).padStart(6), 'first', String(r.first).padStart(6), 'draws', String(r.draws).padStart(6), 'freeze', String(r.gap).padStart(6)); }
      if (process.env.OUT) fs.writeFileSync(process.env.OUT.replace('%', kind), JSON.stringify({ browser: await b.version(), strategy: o.strategy, rows: o.rows, list: o.list }));
    }
    await b.close();
  }
  srv.close(); console.log(fails ? fails + ' check(s) failed' : 'all checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
