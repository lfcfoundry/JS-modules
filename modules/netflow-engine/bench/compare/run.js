#!/usr/bin/env node
// Compares netflow-engine's layouts with general graph-layout libraries, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Every case is a fresh page under `script-src 'self' 'wasm-unsafe-eval'` (no eval); cold = first layout in that page, warm = the second one. Libraries take turns in a rotating order per repeat.
// Run: node run.js <chromium|firefox|webkit|epiphany> [out.json]     Env: REPS (default 3), SIZES (default 300,1000,3000), LIMIT seconds per case (default 60), SKIP=path to an earlier out.json (its `slow` cases are not run),
//      ONLY=regex on lib|task|n to run a few cases, LIBS=folder with the libraries installed from package.json (default ./node_modules), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3];
const LIBS = path.resolve(process.env.LIBS || path.join(__dirname, 'node_modules')), ROOT = path.resolve(__dirname, '../..');
const REPS = +(process.env.REPS || 3), SIZES = (process.env.SIZES || '300,1000,3000').split(',').map(Number), LIMIT = +(process.env.LIMIT || 60) * 1000;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const skip = new Set(process.env.SKIP ? (JSON.parse(fs.readFileSync(process.env.SKIP, 'utf8')).slow || []) : []);
const SRC = {
  engine: ['/engine.js', path.join(ROOT, 'netflow-engine.js')], layers: ['/layers.js', path.join(ROOT, '../netflow-layers/netflow-layers.js')],
  d3: ['/d3.js', path.join(LIBS, 'd3/dist/d3.min.js')], cytoscape: ['/cytoscape.js', path.join(LIBS, 'cytoscape/dist/cytoscape.min.js')],
  dagre: ['/dagre.js', path.join(LIBS, 'dagre/dist/dagre.min.js')], elk: ['/elk.js', path.join(LIBS, 'elkjs/lib/elk.bundled.js')], page: ['/page.js', path.join(__dirname, 'page.js')]
};
const NEEDS = { engine: ['layers', 'engine'], d3: ['d3'], cytoscape: ['cytoscape'], dagre: ['dagre'], elk: ['elk'] };
const MATRIX = [['force', ['engine', 'd3', 'cytoscape']], ['stress', ['engine', 'elk']], ['layered', ['engine', 'dagre', 'elk']]];
const files = {}; for (const k in SRC) files[SRC[k][0]] = fs.readFileSync(SRC[k][1]);
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/page.html') {
    const lib = u.searchParams.get('lib'), tags = NEEDS[lib].map((k) => `<script src="${SRC[k][0]}"></script>`).join('');
    r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return r.end(`<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:"><title>bench</title><link rel="icon" href="data:,">${tags}<script src="/page.js"></script>`);
  }
  const f = files[u.pathname]; if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); r.end(f);
});
const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let b, newPage;
  if (which === 'webkit' || which === 'epiphany') { const wd = require(path.resolve(__dirname, '../../../../tests/webkit-shim.js')); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); newPage = () => b.newPage(); }
  else { const pp = require('puppeteer-core');
    b = which === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 3600000 })
      : await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 3600000, args: ['--no-sandbox', '--disable-gpu'] });
    newPage = () => b.newPage(); }
  const version = await b.version(); console.log(version);
  const cases = []; for (const [task, libs] of MATRIX) for (const n of SIZES) cases.push({ task, n, libs });
  const runs = {}, once = new Set(), slow = [], key = (l, t, n) => l + '|' + t + '|' + n;
  for (let rep = 0; rep < REPS; rep++) for (const c of cases) {
    const order = c.libs.map((_, i) => c.libs[(i + rep) % c.libs.length]);
    for (const lib of order) {
      const k = key(lib, c.task, c.n); if (skip.has(k) || slow.includes(k) || (ONLY && !ONLY.test(k)) || once.has(k)) continue;
      const p = await newPage(); await p.goto(`${base}/page.html?lib=${lib}&task=${c.task}&n=${c.n}`);
      let res = null; const t0 = Date.now();
      while (!res && Date.now() - t0 < LIMIT) { res = await Promise.race([p.evaluate(() => window.__res || null), sleep(LIMIT)]); if (!res) await sleep(100); }
      if (!res) { slow.push(k); console.log(`${k}: did not finish in ${LIMIT / 1000} s`); if (which === 'chromium' || which === 'firefox') { try { b.process().kill('SIGKILL'); } catch (e) {} await sleep(500);
          const pp = require('puppeteer-core'); b = which === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 3600000 }) : await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 3600000, args: ['--no-sandbox', '--disable-gpu'] }); newPage = () => b.newPage(); } continue; }
      (runs[k] = runs[k] || []).push(res); if (res.cold + (res.warm || 0) > 20000) once.add(k);   // a case that takes this long runs once, not REPS times
      if (which !== 'webkit' && which !== 'epiphany') await p.close();
    }
    process.stdout.write('.');
  }
  console.log('');
  const table = [];
  for (const c of cases) for (const lib of c.libs) {
    const k = key(lib, c.task, c.n), R = runs[k] || [], bad = R.filter((r) => r.error || r.finite === false);
    const row = { lib, task: c.task, n: c.n, runs: R.length, cold: med(R.map((r) => r.cold)), warm: med(R.map((r) => r.warm)), quality: med(R.map((r) => r.quality)), stacked: med(R.map((r) => r.stacked)), failed: bad.length ? (bad[0].error || 'non-finite positions') : null, links: R[0] && R[0].links, items: R[0] && R[0].n };
    table.push(row); console.log(`${c.task.padEnd(8)} ${String(c.n).padStart(5)} ${lib.padEnd(10)} ` + (R.length ? `${R.length > 1 || !once.has(k) ? '' : '(one run, slow) '}cold ${row.cold == null ? '-' : row.cold.toFixed(0)} ms  warm ${row.warm == null ? '-' : row.warm.toFixed(0)} ms  ${c.task === 'layered' ? 'crossings' : 'stress'} ${row.quality == null ? '-' : row.quality.toFixed(c.task === 'layered' ? 0 : 3)}  stacked ${row.stacked}` + (row.failed ? '  FAILED: ' + row.failed : '') : (skip.has(k) ? 'skipped (over the limit in an earlier browser)' : (ONLY && !ONLY.test(k) ? 'not run' : 'did not finish'))));
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ version, reps: REPS, sizes: SIZES, limitSeconds: LIMIT / 1000, slow: [...slow, ...skip], table, runs }, null, 1));
  await b.close(); server.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
