// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.5.1 numbers; it needs the test browsers installed.
// LIB0=old LIB1=new ROUNDS=15 node abbatch.js browser out.json : pool.unpack of 96 columns and pool.pack of 12 columns, two library builds taking turns (default pools).
'use strict';
const fs = require('fs'), http = require('http');
process.env.NFM_PUPPETEER = '/tmp/esb/node_modules/puppeteer-core'; process.env.NFM_PLAYWRIGHT = '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = '/home/claude/browsers/firefox/firefox'; process.env.NFM_CHROME = '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js'); const L0 = fs.readFileSync(process.env.LIB0, 'utf8'), L1 = fs.readFileSync(process.env.LIB1, 'utf8');
async function inPage(rounds) {
  const libs = { old: window.P0, nu: window.P1 };
  const seed0 = 12345; let seed = seed0; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const col = (i, n) => { const k = i % 4; let a; if (k === 0) { a = new Float64Array(n); for (let j = 0; j < n; j++) a[j] = Math.round(Math.sin(j / 50) * 1e5 + rnd() * 20) / 100; } else if (k === 1) { a = new Int32Array(n); let v = 100; for (let j = 0; j < n; j++) { v += Math.round((rnd() - 0.5) * 20); a[j] = v; } } else if (k === 2) { a = new Int32Array(n); for (let j = 0; j < n; j++) a[j] = 1700000000 + j * 3 + Math.floor(rnd() * 3); } else { a = new Uint16Array(n); for (let j = 0; j < n; j++) a[j] = Math.floor(rnd() * 40); } return a; };
  const data = []; for (let i = 0; i < 12; i++) data.push(col(i, 85000));
  const pcs = {}, files = {}, pools = {}; for (const id in libs) { pcs[id] = await libs[id].load(); }
  const f12 = data.map((a) => pcs.old.pack(a)); const many = []; for (let i = 0; i < 8; i++) f12.forEach((f) => many.push(f));
  for (const id in libs) pools[id] = await libs[id].pool({ warm: true });
  for (const id in libs) { await pools[id].unpack(many); await pools[id].pack(data); }
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  let run = true, last = performance.now(), gap = 0; (async () => { while (run) { await tick(); const t = performance.now(); gap = Math.max(gap, t - last); last = t; } })();
  const med = (x) => +x.slice().sort((p, q) => p - q)[x.length >> 1].toFixed(1);
  const R = { unpack96: { old: [], nu: [] }, pack12: { old: [], nu: [] }, gapU: { old: [], nu: [] } }; const ids = ['old', 'nu'];
  for (let r = 0; r < rounds + 1; r++) for (const id of (r % 2 ? ids.slice().reverse() : ids)) {
    await tick(); await tick(); gap = 0; last = performance.now(); let t0 = performance.now(); const u = await pools[id].unpack(many); const du = performance.now() - t0; const gu = gap;
    await tick(); await tick(); t0 = performance.now(); const p = await pools[id].pack(data); const dp = performance.now() - t0;
    if (r === 0) { if (u.length !== 96 || p.length !== 12 || p[3].length !== f12[3].length) throw new Error('bad ' + id); } else { R.unpack96[id].push(du); R.pack12[id].push(dp); R.gapU[id].push(gu); }
  }
  run = false; const out = {}; for (const k in R) out[k] = { old: med(R[k].old), nu: med(R[k].nu) }; return out;
}
(async () => {
  const srv = http.createServer((q, r) => { const j = (t) => { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(t); }; if (q.url === '/l0.js') return j(L0 + '\nwindow.P0=PcodecJS;'); if (q.url === '/l1.js') return j(L1 + '\nwindow.P1=PcodecJS;'); r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8><script src="/l0.js"></script><script src="/l1.js"></script><body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const D = await drv0.open(process.argv[2], { timeout: 600000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const out = await D.page.evaluate(inPage, +process.env.ROUNDS || 15); fs.writeFileSync(process.argv[3], JSON.stringify({ version: D.version, out }, null, 1)); console.log(D.version, JSON.stringify(out)); await D.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
