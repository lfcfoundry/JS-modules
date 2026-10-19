#!/usr/bin/env node
// What compiling each shipped WebAssembly program costs the page, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// A fresh page per reading, so no engine cache helps. For each program (ms, smaller is better): sync = `new WebAssembly.Module(bytes)` (the page is frozen for all of it); start = how long `WebAssembly.compile(bytes)` holds the page before it
// returns (the rest happens on another thread); ready = from the call until the promise resolves; inst = `new WebAssembly.Instance` after the compile.
// Run: node tests/wasm-compile-cost-browser.js <chromium|firefox|webkit|epiphany> [out.json]     Env: REPS (default 9), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which)) { console.log('usage: node tests/wasm-compile-cost-browser.js <chromium|firefox|webkit|epiphany> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 9), dir = root + 'modules/', files = [];
for (const m of fs.readdirSync(dir)) { const w = dir + m + '/wasm'; if (fs.existsSync(w)) for (const f of fs.readdirSync(w)) if (f.endsWith('.wasm')) files.push({ name: m + '/' + f, file: w + '/' + f }); }
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname.startsWith('/w/')) { r.setHeader('content-type', 'application/wasm'); return r.end(fs.readFileSync(files[+u.pathname.slice(3)].file)); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'self\'; script-src \'unsafe-inline\' \'wasm-unsafe-eval\'"><title>t</title><link rel="icon" href="data:,"><script>' +
    '(async function(){try{var b=new Uint8Array(await (await fetch("/w/' + (+u.searchParams.get('i')) + '")).arrayBuffer()),t=performance.now(),m=new WebAssembly.Module(b),sync=performance.now()-t;' +
    'var t2=performance.now(),p=WebAssembly.compile(b),start=performance.now()-t2,m2=await p,ready=performance.now()-t2,inst=null;' +
    'try{var t3=performance.now();new WebAssembly.Instance(m2,{});inst=performance.now()-t3}catch(e){}' +
    'window.__res={sync:sync,start:start,ready:ready,inst:inst,bytes:b.length}}catch(e){window.__res={error:String(e)}}})()</script>');
});
const webkitFamily = which === 'webkit' || which === 'epiphany', med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], r1 = (x) => Math.round(x * 10) / 10;
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (webkitFamily) { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] }); }
  const version = await b.version(); console.log(version);
  const out = { version, reps: REPS, rows: [] };
  for (let i = 0; i < files.length; i++) {
    const acc = { sync: [], start: [], ready: [], inst: [] }; let bytes = 0, fail = '';
    for (let rep = 0; rep < REPS + 1; rep++) {
      const p = await b.newPage(); await p.goto(base + '/page.html?i=' + i);
      let res = null; for (let k = 0; k < 200 && !res; k++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(50); }
      if (!webkitFamily) await p.close();
      if (!res || res.error) { fail = res ? res.error : 'no result'; break; }
      bytes = res.bytes; if (rep > 0) for (const k of Object.keys(acc)) if (res[k] !== null) acc[k].push(res[k]);
    }
    const row = { name: files[i].name, bytes, fail }; for (const k of Object.keys(acc)) row[k] = acc[k].length ? r1(med(acc[k])) : null; out.rows.push(row);
    console.log(files[i].name.padEnd(40) + String(bytes).padStart(8) + ' B   sync ' + row.sync + '   start ' + row.start + '   ready ' + row.ready + '   instance ' + row.inst + (fail ? '   (' + fail + ')' : ''));
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
