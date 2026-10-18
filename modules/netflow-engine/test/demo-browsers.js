#!/usr/bin/env node
// Runs the demo page in one real browser at a time, under the page's own policy (script-src 'self' 'wasm-unsafe-eval'). Copyright (c) 2026 LFC Foundry. MIT License.
// For Stress and Force at 3,000 items, with WebAssembly on and off: the page lays out, draws (the canvas is not blank), the WebAssembly twin was really used when on (call counter goes up, no error)
// and not when off, and no error or blocked-script message appears. Prints the browser version on line 1, then one line per run (layout ms, one run, lower is better).
// Run: node test/demo-browsers.js <chromium|firefox|webkit|epiphany> [out.json]     Env: CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH); WebKitGTK / GNOME Web go through tests/webkit-shim.js and need xvfb-run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..', '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b, p;
  if (which === 'webkit' || which === 'epiphany') { const wd = require(path.join(root, 'tests', 'webkit-shim.js')); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); p = await b.newPage(); }
  else { const pp = require('puppeteer-core');
    b = which === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] });
    p = await b.newPage(); }
  const version = await b.version(); console.log(version);
  const errors = []; if (p.on) { p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(String(e.message || e))); }
  await p.goto(base + '/modules/netflow-engine/demo.html');
  await sleep(300);
  const out = { version, runs: [] }; let fail = 0;
  for (const [arr, wasm] of [['stress', true], ['stress', false], ['force', true], ['force', false]]) {
    const r = await p.evaluate((arr, wasm) => {
      const E = window.NetflowEngine; if (!E) return { error: 'NetflowEngine is not defined (script blocked?)' };
      const sel = (id, v) => { const el = document.getElementById(id); el.value = v; };
      sel('n', '3000'); sel('a', arr); document.getElementById('w').checked = wasm;
      const before = { f: E.forceWasm.calls || 0, s: E.stressWasm.calls || 0 };
      document.getElementById('go').click();
      const c = document.getElementById('c'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) ink++;
      return { status: document.getElementById('s').textContent, ink, forceCalls: (E.forceWasm.calls || 0) - before.f, stressCalls: (E.stressWasm.calls || 0) - before.s, forceError: E.forceWasm.error || '', stressError: E.stressWasm.error || '' };
    }, arr, wasm);
    const ms = +((/in (\d+) ms/.exec(r.status || '') || [])[1] || NaN), used = arr === 'stress' ? r.stressCalls : r.forceCalls, err = arr === 'stress' ? r.stressError : r.forceError;
    const good = !r.error && ms >= 0 && r.ink > 1000 && (wasm ? used > 0 && !err : used === 0);
    if (!good) fail++;
    out.runs.push(Object.assign({ arrangement: arr, wasm, ms, wasmCalls: used, good }, r));
    console.log(`${good ? 'ok  ' : 'FAIL'} ${arr}, WebAssembly ${wasm ? 'on ' : 'off'}: ${r.error || (r.status + '; canvas ink ' + r.ink + '; twin calls ' + used + (err ? '; error: ' + err : ''))}`);
  }
  await sleep(200); if (errors.length) { fail++; console.log('FAIL page errors: ' + errors.slice(0, 3).join(' | ')); } else console.log('ok   no console or page errors' + (p.on ? '' : ' (this driver does not show them)'));
  out.errors = errors; if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
