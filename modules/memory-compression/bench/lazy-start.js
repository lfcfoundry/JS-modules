#!/usr/bin/env node
// Checks of the "WebAssembly helper starts on first use" change (2.0.3), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Old file and new file take turns, each in a fresh page under a policy of `script-src 'self' 'wasm-unsafe-eval'` (no eval, as an app with a tight policy would run it).
// Per load: accelerated() right after load, right after the first pack, after awaiting ready(); the first and the second pack of 25,000 links in ms; a checksum of the packed bytes; an exact round trip.
// Run: node bench/lazy-start.js <chromium|firefox|webkit|epiphany> <old-file.js> <new-file.js> [out.json]      Env: LOADS (default 5), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH); WebKitGTK / GNOME Web need xvfb-run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], oldFile = path.resolve(process.argv[3]), newFile = path.resolve(process.argv[4]), outFile = process.argv[5];
const D = require('../test/data.js'), links = D.sets['nfm-links'](25000);
const files = {
  '/old.js': [fs.readFileSync(oldFile), 'text/javascript'], '/new.js': [fs.readFileSync(newFile), 'text/javascript'],
  '/data.js': [Buffer.from('window.__data=' + JSON.stringify(links) + ';'), 'text/javascript'],
  '/check.js': [Buffer.from(`(function(){var MC=window.MemoryCompression,data=window.__data,r={};
    function sum(b){var h=2166136261,i;for(i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619)>>>0;}return h;}
    r.afterLoad=MC.accelerated();
    var t0=performance.now(),p=MC.pack(data),t1=performance.now();
    r.afterFirstPack=MC.accelerated();r.first=t1-t0;
    MC.ready().then(function(v){r.ready=v;r.afterReady=MC.accelerated();
      var t2=performance.now(),p2=MC.pack(data),t3=performance.now();r.second=t3-t2;
      r.bytes=p.length;r.sum=sum(p);r.sameSecond=sum(p2)===r.sum;
      var u=MC.unpack(p);r.roundTrip=u.length===data.length&&JSON.stringify(u)===JSON.stringify(data);
      window.__res=r;},function(e){window.__res={error:String(e)};});})();`), 'text/javascript']
};
const page = (v) => `<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'"><title>wait</title><script src="/data.js"></script><script src="/${v}.js"></script><script src="/check.js"></script>`;
const server = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/page.html') { r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return r.end(page(new URL(q.url, 'http://x').searchParams.get('v'))); }
  const f = files[u]; if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f[1], 'cache-control': 'no-store' }); r.end(f[0]);
});
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port;
  let b, newPage; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (which === 'webkit' || which === 'epiphany') { const wd = require(path.resolve(__dirname, '../../../tests/webkit-shim.js')); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); newPage = () => b.newPage(); }
  else { const pp = require('puppeteer-core');
    b = which === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 3600000 })
      : await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 3600000, args: ['--no-sandbox', '--disable-gpu'] });
    newPage = () => b.newPage(); }
  const version = await b.version(); console.log(version);
  const out = { version, runs: { old: [], new: [] } }, loads = +(process.env.LOADS || 5);
  for (let k = 0; k < loads; k++) for (const v of (k % 2 ? ['old', 'new'] : ['new', 'old'])) {
    const p = await newPage(); await p.goto(base + '/page.html?v=' + v + '&k=' + k);
    let res = null; for (let w = 0; w < 200 && !res; w++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(50); }
    out.runs[v].push(res || { error: 'page did not finish' });
    if (which !== 'webkit' && which !== 'epiphany') await p.close();
  }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  for (const v of ['old', 'new']) {
    const R = out.runs[v], bad = R.filter((r) => r.error);
    if (bad.length) { console.log(v + ': ' + bad.length + ' failed: ' + bad[0].error); continue; }
    console.log(`${v}: accelerated() after load ${[...new Set(R.map((r) => r.afterLoad))]}, after first pack ${[...new Set(R.map((r) => r.afterFirstPack))]}, after ready() ${[...new Set(R.map((r) => r.afterReady))]}; ` +
      `first pack ${med(R.map((r) => r.first)).toFixed(1)} ms, second pack ${med(R.map((r) => r.second)).toFixed(1)} ms (25,000 links, median of ${R.length}, lower is better); packed bytes ${R[0].bytes}, checksum ${R[0].sum}, same in all loads ${R.every((r) => r.sum === R[0].sum)}, round trip exact ${R.every((r) => r.roundTrip)}`);
  }
  const o = out.runs.old[0], n = out.runs.new[0]; if (o && n && !o.error && !n.error) console.log('packed bytes identical old vs new: ' + (o.sum === n.sum && o.bytes === n.bytes));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
