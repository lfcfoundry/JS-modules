#!/usr/bin/env node
// "Compile early" in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// For each module, an old copy (compiles the WebAssembly when it loads or when first used) and a new copy (starts compiling in the background when the file loads) are loaded in a fresh page each, taking turns:
//   load = how long the main thread is busy loading the script(s) (ms, smaller is better); first use = the first call that needs the wasm, either right after the load ("now") or 250 ms later ("idle", after other start-up work);
//   total = load + first use. Also checks that the old and new copy answer the same.
// Run: node tests/compile-early-browser.js <chromium|firefox|webkit|epiphany> spec.json [out.json]     Env: REPS (default 9), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two)
// spec.json: [{ "name": "...", "old": { "file.js": "/path/old/file.js", ... }, "new": { "file.js": "/path/new/file.js", ... }, "use": "JS expression whose value is the answer" }]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], specFile = process.argv[3], outFile = process.argv[4], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which) || !specFile) { console.log('usage: node tests/compile-early-browser.js <chromium|firefox|webkit|epiphany> spec.json [out.json]'); process.exit(2); }
const SPEC = JSON.parse(fs.readFileSync(specFile, 'utf8')), REPS = +(process.env.REPS || 9), CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname.startsWith('/f/')) { const [, , si, ver, ...rest] = u.pathname.split('/'), f = SPEC[+si][ver][decodeURIComponent(rest.join('/'))]; r.setHeader('content-type', 'text/javascript'); return r.end(fs.readFileSync(f)); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const si = +u.searchParams.get('s'), ver = u.searchParams.get('v'), mode = u.searchParams.get('m'), s = SPEC[si];
  const tags = Object.keys(s[ver]).map((k) => '<script src="/f/' + si + '/' + ver + '/' + encodeURIComponent(k) + '"></script>').join('');
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + CSP + '"><title>t</title><link rel="icon" href="data:,"><script>var T0=performance.now();</script>' + tags +
    '<script>var T1=performance.now();function go(){var a=performance.now(),ans;try{ans=String(' + s.use + ')}catch(e){ans="error "+e}var b=performance.now();window.__res={load:T1-T0,first:b-a,ans:ans}}' +
    (mode === 'idle' ? 'setTimeout(go,250)' : 'go()') + '</script>');
});
const webkitFamily = which === 'webkit' || which === 'epiphany', med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], r1 = (x) => Math.round(x * 10) / 10;
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (webkitFamily) { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] }); }
  console.log(await b.version());
  async function run(s, v, m) {
    const p = await b.newPage(); await p.goto(base + '/page.html?s=' + s + '&v=' + v + '&m=' + m);
    let res = null; for (let i = 0; i < 100 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(50); }
    if (!webkitFamily) await p.close();
    return res || { error: 'no result' };
  };
  const out = { version: await b.version(), reps: REPS, rows: [] }; let same = true;
  for (let si = 0; si < SPEC.length; si++) for (const m of ['now', 'idle']) {
    const acc = { old: { load: [], first: [] }, new: { load: [], first: [] } }, ans = { old: new Set(), new: new Set() };
    for (let rep = 0; rep < REPS + 1; rep++) for (const v of rep % 2 ? ['new', 'old'] : ['old', 'new']) {
      const r = await run(si, v, m); if (r.error) continue; ans[v].add(r.ans); if (rep > 0) { acc[v].load.push(r.load); acc[v].first.push(r.first); }
    }
    const row = { name: SPEC[si].name, when: m };
    for (const v of ['old', 'new']) { row[v] = { load: r1(med(acc[v].load)), first: r1(med(acc[v].first)) }; row[v].total = r1(row[v].load + row[v].first); }
    row.same = ans.old.size === 1 && ans.new.size === 1 && [...ans.old][0] === [...ans.new][0]; same = same && row.same; out.rows.push(row);
    console.log(row.name.padEnd(16) + m.padEnd(6) + 'old: load ' + row.old.load + ' + first ' + row.old.first + ' = ' + row.old.total + ' ms   new: load ' + row.new.load + ' + first ' + row.new.first + ' = ' + row.new.total + ' ms   times faster (bigger is better) ' + (row.old.total / Math.max(row.new.total, 0.05)).toFixed(2) + 'x   same answer: ' + row.same);
  }
  console.log(same ? 'PASS' : 'FAIL'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(same ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
