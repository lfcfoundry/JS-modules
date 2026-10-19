// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.1.0 numbers; it needs the test browsers installed (see the repository QA notes).
'use strict';
const http = require('http'), fs = require('fs'); const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const drv = { open: async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } } };
const which = process.argv[2], FILES = { old: 'old110-pack.js', new: 'new110-pack.js' };
const srv = http.createServer((q, r) => { const m = /^\/(old|new)\.html$/.exec(q.url); if (m) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>x</title><script src="/' + m[1] + '.js"></script>x'); } const j = /^\/(old|new)\.js$/.exec(q.url); if (j) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(FILES[j[1]])); } r.writeHead(404); r.end(); });
async function scen(arg) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => performance.now(); const a = new Float64Array(100000); for (let i = 0; i < a.length; i++) a[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100;
  const spin = (ms) => { const t = now(); while (now() - t < ms); };
  spin(5); await sleep(25);                       // the page's other start-up work and a wait for its data
  const t1 = now(); let r = {};
  if (arg.kind === 'main') { const pc = await PcodecJS.load(); r.waitMs = now() - t1; const b = pc.pack(a); const t2 = now(); pc.unpack(b); r.firstUnpackMs = now() - t2; }
  else { const pc = await PcodecJS.load(); const b = pc.pack(a); const t0 = now(); const w = await PcodecJS.worker(); r.waitMs = now() - t0; r.inWorker = w.inWorker; const t2 = now(); await w.unpack(b); r.firstUnpackMs = now() - t2; w.terminate(); }
  return r;
}
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port, res = {};
  for (const kind of ['main', 'worker']) for (const v of ['old', 'new']) { res[kind + '-' + v] = []; for (let i = 0; i < 4; i++) { const D = await drv.open(which, { timeout: 300000 }); await D.goto(base + '/' + v + '.html'); res[kind + '-' + v].push(await D.page.evaluate(scen, { kind })); res.version = D.version; await D.close(); } }
  const med = (a, k) => { const x = a.map((o) => o[k]).sort((p, q) => p - q); return +((x[1] + x[2]) / 2).toFixed(1); };
  const sum = {}; for (const k of Object.keys(res)) if (k !== 'version') sum[k] = { waitMs: med(res[k], 'waitMs'), firstUnpackMs: med(res[k], 'firstUnpackMs') };
  console.log(which, res.version, JSON.stringify(sum)); fs.writeFileSync('early-' + which + '.json', JSON.stringify(res, null, 1)); srv.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
