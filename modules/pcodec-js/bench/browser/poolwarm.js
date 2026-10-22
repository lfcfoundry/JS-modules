// LIB=... ROUNDS=12 node poolwarm.js browser out.json : first split-file unpack on a new default pool after 150 ms idle, pool made with and without { warm: true }, taking turns.
'use strict';
const fs = require('fs'), http = require('http');
process.env.NFM_PUPPETEER = '/tmp/esb/node_modules/puppeteer-core'; process.env.NFM_PLAYWRIGHT = '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = '/home/claude/browsers/firefox/firefox'; process.env.NFM_CHROME = '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js'); const LIB = fs.readFileSync(process.env.LIB, 'utf8');
async function inPage(rounds) {
  const a = new Float64Array(6000000); for (let i = 0; i < a.length; i++) a[i] = Math.round(Math.sin(i / 50) * 1e4) / 100;
  const pc = await PcodecJS.load(), split = pc.pack(a, { parts: 8 });
  const med = (x) => x.slice().sort((p, q) => p - q)[x.length >> 1];
  const T = { cold: [], warm: [] }, C = { cold: [], warm: [] }, ids = ['cold', 'warm'];
  for (let r = 0; r < rounds + 1; r++) for (const id of (r % 2 ? ids.slice().reverse() : ids)) {
    const t0 = performance.now(); const P = await PcodecJS.pool(id === 'warm' ? { warm: true } : {}); const made = performance.now() - t0;
    await new Promise((res) => setTimeout(res, 150));
    const t1 = performance.now(); const v = await P.unpack(split); const dt = performance.now() - t1; if (v.length !== a.length) throw new Error('bad');
    P.terminate(); if (r > 0) { T[id].push(dt); C[id].push(made); }
    await new Promise((res) => setTimeout(res, 50));
  }
  return { firstUnpackMs: { cold: +med(T.cold).toFixed(1), warm: +med(T.warm).toFixed(1) }, poolMakeMs: { cold: +med(C.cold).toFixed(1), warm: +med(C.warm).toFixed(1) } };
}
(async () => {
  const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIB); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8><script src="/lib.js"></script><body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const D = await drv0.open(process.argv[2], { timeout: 600000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const out = await D.page.evaluate(inPage, +process.env.ROUNDS || 12); fs.writeFileSync(process.argv[3], JSON.stringify({ version: D.version, out }, null, 1)); console.log(D.version, JSON.stringify(out)); await D.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
