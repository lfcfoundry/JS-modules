// LIB=path/to/pcodec-js-pack.js ROUNDS=15 node splitfreeze.js chromium|firefox|webkit|epiphany out.json
// 8M-number column: page freeze and time when the result is a new array each call or the caller's own array ({ into }, reused every call). Configurations take turns.
'use strict';
const fs = require('fs'), http = require('http');
process.env.NFM_PUPPETEER = process.env.NFM_PUPPETEER || '/tmp/esb/node_modules/puppeteer-core'; process.env.NFM_PLAYWRIGHT = process.env.NFM_PLAYWRIGHT || '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = process.env.NFM_FIREFOX || '/home/claude/browsers/firefox/firefox'; process.env.NFM_CHROME = process.env.NFM_CHROME || '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js'); const LIB = fs.readFileSync(process.env.LIB, 'utf8');
async function inPage(args) { const rounds = args[0], process_size = args[1];
  const mk = (n) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100; return a; };
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  let run = true, last = performance.now(), maxGap = 0; (async () => { while (run) { await tick(); const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; } })();
  const a = mk(8000000), pc = await PcodecJS.load(), plain = pc.pack(a), split = pc.pack(a, { parts: 8 });
  const one = await PcodecJS.worker(), P = await PcodecJS.pool(process_size ? { size: process_size } : {});
  let bufN = new Float64Array(a.length), bufS = new Float64Array(a.length);
  const cfgs = {
    'normal file, new array': async () => one.unpack(plain),
    'normal file, reused array': async () => (bufN = await one.unpack(plain, { into: bufN })),
    'split, joined, new array': async () => P.unpack(split),
    'split, joined, reused array': async () => (bufS = await P.unpack(split, { into: bufS })),
    'split, parts only': async () => P.unpack(split, { parts: true }),
  };
  const ids = Object.keys(cfgs), R = {}; ids.forEach((k) => R[k] = { t: [], g: [] });
  for (let r = 0; r < rounds + 1; r++) {
    const k = r % ids.length;
    for (const id of ids.slice(k).concat(ids.slice(0, k))) {
      await tick(); await tick(); maxGap = 0; last = performance.now(); const t0 = performance.now(); const v = await cfgs[id](); const dt = performance.now() - t0; await tick();
      if (r === 0) { if (id.indexOf('parts') < 0 && (v.length !== a.length || v[7999999] !== a[7999999] || v[12345] !== a[12345])) throw new Error('wrong result ' + id); } else { R[id].t.push(dt); R[id].g.push(maxGap); }
    }
  }
  run = false; one.terminate(); P.terminate();
  const q = (x, p) => { x = x.slice().sort((m, n) => m - n); return +x[Math.min(x.length - 1, Math.floor(x.length * p))].toFixed(1); };
  const res = {}; ids.forEach((k) => res[k] = { ms: q(R[k].t, 0.5), freezeMedian: q(R[k].g, 0.5), freezeP90: q(R[k].g, 0.9), freezeMax: q(R[k].g, 1), roundsOver8ms: R[k].g.filter((x) => x > 8).length, of: R[k].g.length });
  return res;
}
(async () => {
  const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIB); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8><script src="/lib.js"></script><body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const D = await drv0.open(process.argv[2], { timeout: 900000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const t0 = Date.now(); const out = await D.page.evaluate(inPage, [+process.env.ROUNDS || 15, +process.env.POOL || 0]); const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log(process.argv[2], version, 'wall s', ((Date.now() - t0) / 1000).toFixed(1)); for (const k in out) console.log('  ', k.padEnd(30), JSON.stringify(out[k]));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
