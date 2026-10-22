// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.2.0 numbers; it needs the test browsers installed (see the repository QA notes).
// node poolbench.js chromium|firefox|webkit|epiphany out.json
// Packs and unpacks the 12 columns with 1, 2 and 4 background workers (columns shared out largest-first), wall time on the page, median of ROUNDS rounds.
'use strict';
const fs = require('fs'), http = require('http'), W = '/tmp/claude-0/pcm/work/';
process.env.NFM_PUPPETEER = process.env.NFM_PUPPETEER || '/tmp/esb/node_modules/puppeteer-core';
process.env.NFM_PLAYWRIGHT = process.env.NFM_PLAYWRIGHT || '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = process.env.NFM_FIREFOX || '/home/claude/browsers/firefox/firefox';
process.env.NFM_CHROME = process.env.NFM_CHROME || '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const open = async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } };
const man = JSON.parse(fs.readFileSync(W + 'cols.json')), bin = fs.readFileSync(W + 'cols.bin');
const PICK = [/NFM node x, Distances/, /links.to/, /links.weight/, /links.x1/, /events.ts/, /^temperature/, /^price/, /geojson/, /kWh/, /housing median_income/, /quakes Latitude/, /events.user/];
const cols = PICK.map((r) => man.find((m) => r.test(m.name)));
const LIBS = (process.env.LIBS || '').split(',').map((x) => { const [id, p] = x.split('='); return { id, src: fs.readFileSync(p, 'utf8') }; });
const arg0 = { cols: cols.map((m) => ({ name: m.name, kind: m.kind, n: m.n, b64: bin.subarray(m.off, m.off + m.bytes).toString('base64') })), rounds: +process.env.ROUNDS || 9, libs: LIBS };
const arg = { rounds: arg0.rounds, libs: LIBS };
async function inPage(arg) {
  const libs = {};
  arg.libs.forEach((l, i) => { libs[l.id] = window['L' + i]; }); for (const id in libs) await libs[id].load();
  const ids = arg.libs.map((l) => l.id), times = {}; ids.forEach((i) => times[i] = []);
  for (let r = 0; r < arg.rounds + 1; r++) {
    const k = r % ids.length, order = ids.slice(k).concat(ids.slice(0, k));
    for (const id of order) { await new Promise((q) => setTimeout(q, 60)); const t0 = performance.now(); const w = await libs[id].worker(); const dt = performance.now() - t0; if (!w.inWorker) throw new Error('no worker'); w.terminate(); if (r) times[id].push(dt); }
  }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
  const out = {}; ids.forEach((i) => out[i] = med(times[i])); return { readyMs: out };
}
(async () => {
  const srv = http.createServer((q, r) => { if (/^\/lib\d\.js$/.test(q.url)) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIBS[+q.url.slice(4, 5)].src); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8>' + LIBS.map((l, i) => '<script src="/lib' + i + '.js"></script><script>window.L' + i + ' = PcodecJS;</script>').join('') + '<body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const which = process.argv[2], D = await open(which, { timeout: 1800000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const t0 = Date.now(); const out = await D.page.evaluate(inPage, arg); const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log(which, version, 'wall s', ((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(out));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
